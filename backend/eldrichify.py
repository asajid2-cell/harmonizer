from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Optional

import math
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DEFAULT_VAE_DIR = PROJECT_ROOT / "VAE"


def _device(preferred: Optional[str] = None) -> torch.device:
    if preferred:
        return torch.device(preferred)
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _load_state(
    module: nn.Module,
    checkpoint_path: Path,
    device: torch.device,
    *,
    state_key: Optional[str] = None,
) -> None:
    if not checkpoint_path.is_file():
        raise FileNotFoundError(f"Missing checkpoint: {checkpoint_path}")
    state = torch.load(checkpoint_path, map_location=device)
    if isinstance(state, dict) and state_key and state_key in state:
        state = state[state_key]
    elif isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    module.load_state_dict(state)
    module.to(device)
    module.eval()


class ConvEncoder(nn.Module):
    """Convolutional encoder for the VAE."""

    def __init__(
        self,
        in_channels: int = 3,
        out_dim: int = 64,
        base_channels: int = 32,
        image_size: int = 32,
        vae_heads: bool = True,
    ) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_channels, base_channels, 4, 2, 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(base_channels, base_channels * 2, 4, 2, 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(base_channels * 2, base_channels * 4, 4, 2, 1),
            nn.ReLU(inplace=True),
        )
        spatial_size = image_size // 8
        flatten_dim = base_channels * 4 * spatial_size * spatial_size
        self.vae_heads = vae_heads
        if vae_heads:
            self.fc_mu = nn.Linear(flatten_dim, out_dim)
            self.fc_logvar = nn.Linear(flatten_dim, out_dim)
        else:
            self.fc = nn.Linear(flatten_dim, out_dim)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor] | torch.Tensor:
        h = self.net(x)
        h = h.view(h.size(0), -1)
        if self.vae_heads:
            return self.fc_mu(h), self.fc_logvar(h)
        return self.fc(h)


class ConvDecoder(nn.Module):
    """Convolutional decoder for the VAE."""

    def __init__(
        self,
        in_dim: int = 64,
        out_channels: int = 3,
        base_channels: int = 32,
        image_size: int = 32,
    ) -> None:
        super().__init__()
        spatial_size = image_size // 8
        self.base_channels = base_channels
        self.spatial_size = spatial_size
        self.fc_dim = base_channels * 4 * spatial_size * spatial_size
        self.fc = nn.Linear(in_dim, self.fc_dim)
        self.net = nn.Sequential(
            nn.ConvTranspose2d(base_channels * 4, base_channels * 2, 4, 2, 1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(base_channels * 2, base_channels, 4, 2, 1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(base_channels, out_channels, 4, 2, 1),
            nn.Sigmoid(),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        h = self.fc(z)
        h = h.view(h.size(0), self.base_channels * 4, self.spatial_size, self.spatial_size)
        return self.net(h)


class BaseVAE(nn.Module):
    """Base convolutional variational autoencoder."""

    def __init__(
        self,
        in_channels: int = 3,
        image_size: int = 32,
        latent_dim: int = 64,
        base_channels: int = 32,
    ) -> None:
        super().__init__()
        self.latent_dim = latent_dim
        self.encoder = ConvEncoder(in_channels, latent_dim, base_channels, image_size, vae_heads=True)
        self.decoder = ConvDecoder(latent_dim, in_channels, base_channels, image_size)

    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, logvar = self.encoder(x)
        z = self.reparameterize(mu, logvar)
        x_hat = self.decoder(z)
        return x_hat, mu, logvar, z

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        mu, logvar = self.encoder(x)
        return self.reparameterize(mu, logvar)

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        return self.decoder(z)


class LatentRefiner(nn.Module):
    """Refine latent code quality using residual MLP layers."""

    def __init__(self, latent_dim: int = 64, hidden_dim: int = 256, num_layers: int = 4) -> None:
        super().__init__()
        layers: list[nn.Module] = [
            nn.Linear(latent_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(inplace=True),
        ]
        for _ in range(num_layers - 2):
            layers.extend(
                [
                    nn.Linear(hidden_dim, hidden_dim),
                    nn.LayerNorm(hidden_dim),
                    nn.ReLU(inplace=True),
                    nn.Dropout(0.1),
                ]
            )
        layers.append(nn.Linear(hidden_dim, latent_dim))
        self.net = nn.Sequential(*layers)

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        return z + self.net(z)


class ResidualBlock(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, 1, 1)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, 1, 1)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        out = F.relu(self.bn1(self.conv1(x)), inplace=True)
        out = self.bn2(self.conv2(out))
        out += residual
        return F.relu(out, inplace=True)


class PixelUpsampler(nn.Module):
    """Upsample decoded images (32x32 -> 64x64) and enhance detail."""

    def __init__(self, in_channels: int = 3, base_channels: int = 64, num_residual: int = 4) -> None:
        super().__init__()
        self.conv_in = nn.Conv2d(in_channels, base_channels, 3, 1, 1)
        self.residuals = nn.Sequential(*[ResidualBlock(base_channels) for _ in range(num_residual)])
        self.upsample = nn.Sequential(
            nn.Conv2d(base_channels, base_channels * 4, 3, 1, 1),
            nn.PixelShuffle(2),
            nn.ReLU(inplace=True),
        )
        self.conv_out = nn.Sequential(
            nn.Conv2d(base_channels, base_channels, 3, 1, 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(base_channels, in_channels, 3, 1, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        skip = F.interpolate(x, scale_factor=2, mode="bicubic", align_corners=False)
        feat = self.conv_in(x)
        feat = self.residuals(feat)
        feat = self.upsample(feat)
        out = self.conv_out(feat)
        return out + skip


class HdResidualBlock(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(channels, channels, 3, padding=1),
            nn.GroupNorm(8, channels),
            nn.SiLU(),
            nn.Conv2d(channels, channels, 3, padding=1),
            nn.GroupNorm(8, channels),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return F.silu(self.block(x) + x)


class HdUpsampleBlock(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(channels, channels * 4, 3, padding=1),
            nn.PixelShuffle(2),
            nn.SiLU(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class HdSuperResNet(nn.Module):
    """DF2K-trained super-resolution model for large upscale factors."""

    def __init__(self, channels: int = 3, base_channels: int = 96, scale: int = 8) -> None:
        super().__init__()
        if scale not in {2, 4, 8, 16}:
            raise ValueError("scale must be 2, 4, 8, or 16")
        self.head = nn.Sequential(nn.Conv2d(channels, base_channels, 3, padding=1), nn.SiLU())
        self.body = nn.Sequential(*[HdResidualBlock(base_channels) for _ in range(8)])
        steps = int(math.log2(scale))
        self.upsample = nn.Sequential(*[HdUpsampleBlock(base_channels) for _ in range(steps)])
        self.tail = nn.Sequential(nn.Conv2d(base_channels, channels, 3, padding=1), nn.Sigmoid())

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.head(x)
        h = self.body(h)
        h = self.upsample(h)
        return self.tail(h)


@dataclass(frozen=True)
class EldrichifyResult:
    final: torch.Tensor
    stages: dict[str, torch.Tensor]
    original_size: tuple[int, int]


class EldrichifyPipeline:
    """End-to-end helper that loads checkpoints and runs inference."""

    def __init__(
        self,
        checkpoint_dir: Path | None = None,
        device: Optional[str | torch.device] = None,
        image_size: int = 32,
    ) -> None:
        self.checkpoint_dir = checkpoint_dir or DEFAULT_VAE_DIR
        self.device = torch.device(device) if device is not None else _device()
        self.image_size = image_size
        self.target_size = 64
        self._load_models()
        self.preprocess = transforms.Compose(
            [
                transforms.Resize((self.image_size, self.image_size)),
                transforms.ToTensor(),
            ]
        )
        self.to_pil = transforms.ToPILImage()

    def _load_models(self) -> None:
        ckpt_dir = Path(self.checkpoint_dir)
        self.vae = BaseVAE()
        self.refiner = LatentRefiner()
        self.upsampler = PixelUpsampler()
        self.hd_superres = HdSuperResNet(channels=3, base_channels=96, scale=8)
        _load_state(self.vae, ckpt_dir / "base_vae_best.pth", self.device)
        _load_state(self.refiner, ckpt_dir / "latent_refiner_best.pth", self.device)
        _load_state(self.upsampler, ckpt_dir / "pixel_upsampler_best.pth", self.device)
        hd_best = ckpt_dir / "checkpoints" / "hd_superres" / "hd_superres_best.pth"
        hd_last = ckpt_dir / "checkpoints" / "hd_superres" / "hd_superres_last.pth"
        try:
            _load_state(self.hd_superres, hd_best, self.device, state_key="model_state")
        except FileNotFoundError:
            _load_state(self.hd_superres, hd_last, self.device, state_key="model_state")

    def _run_tensor(self, tensor: torch.Tensor, target_size: tuple[int, int]) -> EldrichifyResult:
        with torch.no_grad():
            z_blurry = self.vae.encode(tensor)
            x_vae = self.vae.decode(z_blurry)
            z_refined = self.refiner(z_blurry)
            x_refined = self.vae.decode(z_refined)
            x_upsampled = self.upsampler(x_refined).clamp(0, 1)
            x_hd = self.hd_superres(x_upsampled).clamp(0, 1)
            x_final = F.interpolate(
                x_hd,
                size=(target_size[1], target_size[0]),
                mode="bicubic",
                align_corners=False,
            )
        stages = {
            "input32": tensor.squeeze(0).cpu(),
            "vae": x_vae.squeeze(0).cpu(),
            "refined": x_refined.squeeze(0).cpu(),
            "upsampled": x_upsampled.squeeze(0).cpu(),
            "hd": x_hd.squeeze(0).cpu(),
            "final": x_final.squeeze(0).cpu(),
        }
        return EldrichifyResult(final=stages["final"], stages=stages, original_size=target_size)

    def run(self, image: Image.Image, target_resolution: tuple[int, int] | None = None) -> EldrichifyResult:
        rgb_image = image.convert("RGB")
        orig_width, orig_height = rgb_image.size
        tensor = self.preprocess(rgb_image).unsqueeze(0).to(self.device)
        target = target_resolution or (orig_width, orig_height)
        return self._run_tensor(tensor, target)

    def run_from_file(self, file_obj: BinaryIO | str | Path) -> EldrichifyResult:
        if isinstance(file_obj, (str, Path)):
            image = Image.open(file_obj)
        else:
            image = Image.open(file_obj)
        return self.run(image)

    def save_result(self, image: Image.Image, output_path: Path, target_resolution: tuple[int, int] | None = None) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        result = self.run(image, target_resolution)
        self.to_pil(result.final).save(output_path, format="PNG")
        return output_path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Eldrichify VAE + super-resolution inference")
    parser.add_argument("image", type=str, help="Input image path")
    parser.add_argument("--output", type=str, help="Where to save the enhanced image (PNG)")
    parser.add_argument("--checkpoint-dir", type=str, help="Directory containing VAE checkpoints")
    parser.add_argument("--device", type=str, help="torch device override, e.g. cpu or cuda:0")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    checkpoint_dir = Path(args.checkpoint_dir) if args.checkpoint_dir else DEFAULT_VAE_DIR
    pipeline = EldrichifyPipeline(checkpoint_dir=checkpoint_dir, device=args.device)
    image = Image.open(args.image).convert("RGB")
    output_path = Path(args.output) if args.output else Path(args.image).with_suffix(".eldrich.png")
    saved = pipeline.save_result(image, output_path)
    print(f"[eldrichify] Saved enhanced image to {saved}")


if __name__ == "__main__":
    main()
