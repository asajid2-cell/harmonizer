import genanki
import random

# Generate unique IDs
DECK_ID = random.randrange(1 << 30, 1 << 31)
MODEL_ID = random.randrange(1 << 30, 1 << 31)

# Define custom model with styling
model = genanki.Model(
    MODEL_ID,
    'VAE Deep Learning Model',
    fields=[
        {'name': 'Question'},
        {'name': 'Answer'},
        {'name': 'Category'},
        {'name': 'Code'},
    ],
    templates=[
        {
            'name': 'Card 1',
            'qfmt': '''
                <div class="card">
                    <div class="category-badge">{{Category}}</div>
                    <div class="question">{{Question}}</div>
                </div>
            ''',
            'afmt': '''
                <div class="card">
                    <div class="category-badge">{{Category}}</div>
                    <div class="question">{{Question}}</div>
                    <hr>
                    <div class="answer">{{Answer}}</div>
                    {{#Code}}
                    <div class="code-block">{{Code}}</div>
                    {{/Code}}
                </div>
            ''',
        },
    ],
    css='''
        .card {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            font-size: 18px;
            text-align: center;
            color: #2c3e50;
            background-color: #ffffff;
            padding: 20px;
            line-height: 1.6;
        }

        .category-badge {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 15px;
        }

        .question {
            font-size: 22px;
            font-weight: 600;
            margin: 20px 0;
            color: #34495e;
        }

        hr {
            border: none;
            border-top: 2px solid #ecf0f1;
            margin: 25px 0;
        }

        .answer {
            text-align: left;
            font-size: 18px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 8px;
            margin: 15px 0;
        }

        .answer strong {
            color: #e74c3c;
            font-weight: 700;
        }

        .answer ul, .answer ol {
            margin: 10px 0;
            padding-left: 25px;
        }

        .answer li {
            margin: 8px 0;
        }

        .code-block {
            background-color: #1e1e1e;
            color: #d4d4d4;
            padding: 15px;
            border-radius: 8px;
            font-family: 'Courier New', Consolas, Monaco, monospace;
            font-size: 14px;
            text-align: left;
            overflow-x: auto;
            margin-top: 15px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .code-block .keyword {
            color: #569cd6;
        }

        .code-block .string {
            color: #ce9178;
        }

        .code-block .comment {
            color: #6a9955;
        }
    '''
)

# Create deck
deck = genanki.Deck(
    DECK_ID,
    'Assignment 7: Autoencoders & VAEs - Deep Learning'
)

# Card content
cards = [
    # ===== AUTOENCODER FUNDAMENTALS =====
    {
        'question': 'What is an autoencoder?',
        'answer': '''<strong>An autoencoder is a neural network architecture</strong> designed to learn efficient representations (encodings) of data in an unsupervised manner.
<br><br>
<strong>Key components:</strong>
<ul>
<li><strong>Encoder:</strong> Compresses input data into a lower-dimensional latent representation (bottleneck)</li>
<li><strong>Decoder:</strong> Reconstructs the original input from the latent representation</li>
</ul>
<br>
<strong>Objective:</strong> Minimize reconstruction error between input and output, forcing the network to learn meaningful features in the latent space.''',
        'category': 'Autoencoder Fundamentals',
        'code': ''
    },
    {
        'question': 'What is the architecture of the encoder used in this assignment?',
        'answer': '''<strong>Convolutional Encoder (ConvEncoder)</strong> with the following structure:
<br><br>
<strong>Convolutional layers:</strong>
<ul>
<li>Conv2d: channels → base_channels (stride 2) → size/2</li>
<li>ReLU activation</li>
<li>Conv2d: base_channels → base_channels*2 (stride 2) → size/4</li>
<li>ReLU activation</li>
<li>Conv2d: base_channels*2 → base_channels*4 (stride 2) → size/8</li>
<li>ReLU activation</li>
</ul>
<br>
<strong>Fully connected layer:</strong>
<ul>
<li>Flatten spatial dimensions</li>
<li>Linear layer to output dimension (latent_dim)</li>
</ul>
<br>
<strong>For VAE:</strong> Two separate heads output mu and logvar instead of a single output.''',
        'category': 'Architecture',
        'code': '''class ConvEncoder(nn.Module):
    def __init__(self, in_channels=1, out_dim=16,
                 base_channels=32, image_size=28,
                 vae_heads=False):
        super().__init__()
        # Down: s -> s/2 -> s/4 -> s/8
        self.net = nn.Sequential(
            nn.Conv2d(in_channels, base_channels, 4, 2, 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(base_channels, base_channels*2, 4, 2, 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(base_channels*2, base_channels*4, 4, 2, 1),
            nn.ReLU(inplace=True),
        )
        # VAE mode: output mu and logvar
        if vae_heads:
            self.fc_mu = nn.Linear(flatten_dim, out_dim)
            self.fc_logvar = nn.Linear(flatten_dim, out_dim)
        else:
            self.fc = nn.Linear(flatten_dim, out_dim)'''
    },
    {
        'question': 'What is the architecture of the decoder used in this assignment?',
        'answer': '''<strong>Convolutional Decoder (ConvDecoder)</strong> - mirrors the encoder:
<br><br>
<strong>Fully connected layer:</strong>
<ul>
<li>Linear: latent_dim → (base_channels*4 × spatial_size × spatial_size)</li>
<li>Reshape to feature maps</li>
</ul>
<br>
<strong>Transposed convolutional layers (upsampling):</strong>
<ul>
<li>ConvTranspose2d: base_channels*4 → base_channels*2 (stride 2) → size/4</li>
<li>ReLU activation</li>
<li>ConvTranspose2d: base_channels*2 → base_channels (stride 2) → size/2</li>
<li>ReLU activation</li>
<li>ConvTranspose2d: base_channels → out_channels (stride 2) → original size</li>
<li><strong>Sigmoid activation</strong> to ensure output is in [0, 1] range</li>
</ul>''',
        'category': 'Architecture',
        'code': '''class ConvDecoder(nn.Module):
    def __init__(self, in_dim=16, out_channels=1,
                 base_channels=32, image_size=28):
        super().__init__()
        spatial_size = image_size // 8
        self.fc = nn.Linear(in_dim, base_channels*4*spatial_size*spatial_size)

        # Up: s/8 -> s/4 -> s/2 -> s
        self.net = nn.Sequential(
            nn.ConvTranspose2d(base_channels*4, base_channels*2, 4, 2, 1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(base_channels*2, base_channels, 4, 2, 1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(base_channels, out_channels, 4, 2, 1),
            nn.Sigmoid()  # Output in [0,1]
        )'''
    },
    {
        'question': 'What loss function is used for training autoencoders in this assignment?',
        'answer': '''<strong>Mean Squared Error (MSE) Loss</strong> for reconstruction:
<br><br>
<strong>Formula:</strong> MSE = mean((x_hat - x)²)
<br><br>
<strong>Where:</strong>
<ul>
<li><strong>x:</strong> Original input image</li>
<li><strong>x_hat:</strong> Reconstructed image from decoder</li>
</ul>
<br>
<strong>Purpose:</strong> Measures pixel-wise difference between input and reconstruction. The model learns to minimize this difference, forcing it to capture important features in the latent representation.
<br><br>
<strong>Alternative:</strong> Binary Cross-Entropy (BCE) loss is also commonly used, especially when pixel values are treated as probabilities.''',
        'category': 'Autoencoder Fundamentals',
        'code': '''def ae_loss(x, x_hat, reduction="mean"):
    """Autoencoder reconstruction loss (MSE)"""
    loss = F.mse_loss(x_hat, x, reduction=reduction)
    return loss'''
    },
    {
        'question': 'What is the latent space in an autoencoder?',
        'answer': '''<strong>The latent space (or latent representation)</strong> is the compressed, lower-dimensional representation learned by the encoder.
<br><br>
<strong>Characteristics:</strong>
<ul>
<li><strong>Dimensionality:</strong> Much smaller than input (e.g., 128 dimensions for 32×32×3 = 3,072 pixel images)</li>
<li><strong>Information bottleneck:</strong> Forces network to learn only the most important features</li>
<li><strong>Feature extraction:</strong> Captures high-level semantic information about the input</li>
</ul>
<br>
<strong>In this assignment:</strong>
<ul>
<li>CIFAR-10 AE: latent_dim = 128</li>
<li>Input: 32×32×3 = 3,072 dimensions → Compressed to 128 dimensions</li>
<li>Compression ratio: ~24:1</li>
</ul>''',
        'category': 'Autoencoder Fundamentals',
        'code': ''
    },
    {
        'question': 'Why do autoencoders typically produce blurry reconstructions?',
        'answer': '''<strong>Autoencoders generate blurry images</strong> because they optimize for pixel-wise reconstruction error (MSE/BCE):
<br><br>
<strong>Reasons:</strong>
<ul>
<li><strong>Averaging effect:</strong> MSE penalizes errors equally, so predicting the average of possible values minimizes loss</li>
<li><strong>No distribution modeling:</strong> Standard AEs learn a deterministic mapping, not a probability distribution</li>
<li><strong>High-frequency loss:</strong> Sharp edges and fine details contribute less to overall MSE than getting colors roughly correct</li>
</ul>
<br>
<strong>Example:</strong> For a pixel that could be black or white, predicting gray (average) has lower MSE than choosing one or the other.
<br><br>
<strong>Solutions:</strong> VAEs, GANs, or perceptual losses can produce sharper results.''',
        'category': 'Autoencoder Fundamentals',
        'code': ''
    },

    # ===== VAE FUNDAMENTALS =====
    {
        'question': 'What is a Variational Autoencoder (VAE)?',
        'answer': '''<strong>A VAE is a generative model</strong> that learns a probabilistic latent representation of data.
<br><br>
<strong>Key differences from standard autoencoders:</strong>
<ul>
<li><strong>Probabilistic encoding:</strong> Encoder outputs parameters of a distribution (μ, σ) instead of a fixed vector</li>
<li><strong>Sampling:</strong> Latent code is sampled from N(μ, σ²)</li>
<li><strong>Regularization:</strong> KL divergence term encourages latent distribution to match a prior (usually N(0, I))</li>
<li><strong>Generative:</strong> Can generate new samples by sampling from the prior distribution</li>
</ul>
<br>
<strong>Objective:</strong> Maximize ELBO (Evidence Lower Bound) = Reconstruction - KL divergence''',
        'category': 'VAE Fundamentals',
        'code': ''
    },
    {
        'question': 'What is the reparameterization trick and why is it necessary?',
        'answer': '''<strong>The reparameterization trick</strong> enables backpropagation through stochastic sampling in VAEs.
<br><br>
<strong>Problem:</strong> Cannot backpropagate through random sampling z ~ N(μ, σ²)
<br><br>
<strong>Solution:</strong> Reparameterize the random variable:
<ul>
<li>Sample ε ~ N(0, I) (fixed, no gradients needed)</li>
<li>Compute z = μ + σ ⊙ ε</li>
<li>Now z is deterministic given μ, σ, allowing gradients to flow</li>
</ul>
<br>
<strong>Key insight:</strong> Move randomness outside the computation graph while maintaining the same distribution.''',
        'category': 'VAE Fundamentals',
        'code': '''def reparameterize(self, mu, logvar):
    """Reparameterization trick: z = mu + sigma * epsilon"""
    std = torch.exp(0.5 * logvar)  # σ = exp(0.5 * log(σ²))
    eps = torch.randn_like(std)     # ε ~ N(0, I)
    return mu + eps * std           # z ~ N(μ, σ²)'''
    },
    {
        'question': 'What are the two components of the VAE loss function?',
        'answer': '''<strong>VAE Loss = Reconstruction Loss + β × KL Divergence</strong>
<br><br>
<strong>1. Reconstruction Loss:</strong>
<ul>
<li>Measures how well the decoder reconstructs the input</li>
<li>Typically MSE or BCE: ||x - x_hat||²</li>
<li>Encourages faithful reconstruction</li>
</ul>
<br>
<strong>2. KL Divergence:</strong>
<ul>
<li>KL(q(z|x) || p(z)) where p(z) = N(0, I)</li>
<li>Formula: -0.5 × Σ(1 + log(σ²) - μ² - σ²)</li>
<li>Regularizes the latent space to match the prior</li>
<li>Prevents overfitting and enables generation</li>
</ul>
<br>
<strong>β hyperparameter:</strong> Controls the trade-off between reconstruction and regularization.''',
        'category': 'VAE Fundamentals',
        'code': '''def vae_loss(x, x_hat, mu, logvar, beta=1.0):
    # Reconstruction loss
    recon_loss = F.mse_loss(x_hat, x, reduction='mean')

    # KL divergence
    kl_loss = -0.5 * torch.sum(
        1 + logvar - mu.pow(2) - logvar.exp(),
        dim=1
    ).mean()

    # Total loss
    return recon_loss + beta * kl_loss, recon_loss, kl_loss'''
    },
    {
        'question': 'What does the KL divergence term in the VAE loss accomplish?',
        'answer': '''<strong>KL divergence regularizes the latent space</strong> by penalizing deviation from the prior distribution.
<br><br>
<strong>Effects:</strong>
<ul>
<li><strong>Smooth latent space:</strong> Similar inputs map to nearby points in latent space</li>
<li><strong>Prevents overfitting:</strong> Limits the encoder's freedom to memorize training data</li>
<li><strong>Enables generation:</strong> Can sample z ~ N(0, I) to generate new images</li>
<li><strong>Encourages coverage:</strong> Latent codes spread across the space rather than clustering</li>
</ul>
<br>
<strong>Formula:</strong> KL(N(μ, σ²) || N(0, I)) = -0.5 × Σ(1 + log(σ²) - μ² - σ²)
<br><br>
<strong>Intuition:</strong> Pushes μ → 0 and σ² → 1, making the posterior close to the prior.''',
        'category': 'VAE Fundamentals',
        'code': ''
    },

    # ===== POSTERIOR COLLAPSE =====
    {
        'question': 'What is posterior collapse in VAEs?',
        'answer': '''<strong>Posterior collapse</strong> occurs when the encoder learns to ignore the input and output the prior distribution N(0, I) for all inputs.
<br><br>
<strong>Symptoms:</strong>
<ul>
<li><strong>KL divergence ≈ 0:</strong> All encodings are identical</li>
<li><strong>Uninformative latent space:</strong> z contains no information about x</li>
<li><strong>Decoder ignores z:</strong> Reconstructions are the same regardless of input</li>
<li><strong>Poor generation quality:</strong> Generated samples are blurry or meaningless</li>
</ul>
<br>
<strong>In the notebook:</strong> Occurred around epoch 11 when KL dropped from ~1000 to 0.001 with beta warmup.''',
        'category': 'Posterior Collapse',
        'code': ''
    },
    {
        'question': 'Why does posterior collapse happen?',
        'answer': '''<strong>Posterior collapse</strong> is caused by an imbalance in the VAE objective:
<br><br>
<strong>Root causes:</strong>
<ul>
<li><strong>Powerful decoder:</strong> If decoder can reconstruct well without z, encoder learns to output uninformative z</li>
<li><strong>Aggressive KL penalty:</strong> High β pushes encoder to always output N(0, I)</li>
<li><strong>Optimization dynamics:</strong> Reconstruction loss dominates early, then KL term suddenly forces collapse</li>
<li><strong>Local minimum:</strong> Setting μ=0, σ=1 minimizes KL (=0) with acceptable reconstruction</li>
</ul>
<br>
<strong>The decoder learns:</strong> "I can generate decent images from noise, so I'll ignore z"
<br>
<strong>The encoder learns:</strong> "Outputting the prior minimizes KL with no reconstruction penalty"''',
        'category': 'Posterior Collapse',
        'code': ''
    },
    {
        'question': 'What is beta (β) warmup and why is it used?',
        'answer': '''<strong>Beta warmup</strong> gradually increases the KL weight (β) during training to prevent posterior collapse.
<br><br>
<strong>Strategy:</strong>
<ul>
<li><strong>Start:</strong> β = 0 (or very small) for initial epochs</li>
<li><strong>Warmup:</strong> Linearly increase β to target value over many epochs</li>
<li><strong>Hold:</strong> Keep β at target value for remaining training</li>
</ul>
<br>
<strong>Why it works:</strong>
<ul>
<li>Allows encoder to learn informative representations first (β=0 → standard AE)</li>
<li>Decoder learns to use z before KL penalty is applied</li>
<li>Gradual regularization prevents sudden collapse</li>
</ul>
<br>
<strong>Example schedule:</strong> β=0 for 10 epochs, then ramp to β=0.8 over 30 epochs''',
        'category': 'Posterior Collapse',
        'code': '''def get_beta_with_warmup(epoch, target_beta, warmup_epochs,
                          start_epoch=0, min_beta=0.0):
    if epoch < start_epoch:
        return min_beta
    elif epoch < start_epoch + warmup_epochs:
        # Linear warmup
        progress = (epoch - start_epoch) / warmup_epochs
        return min_beta + (target_beta - min_beta) * progress
    else:
        return target_beta'''
    },
    {
        'question': 'What is KL-free nats and how does it help prevent collapse?',
        'answer': '''<strong>KL-free nats</strong> allows a small amount of KL divergence without penalty, preventing over-regularization.
<br><br>
<strong>Implementation:</strong>
<ul>
<li>Set a threshold λ (e.g., 0.001 nats per dimension)</li>
<li>Only penalize KL above this threshold: KL_loss = max(0, KL - λ)</li>
</ul>
<br>
<strong>Benefits:</strong>
<ul>
<li><strong>Prevents collapse:</strong> Encoder can use some capacity without penalty</li>
<li><strong>Rate-distortion trade-off:</strong> Balances information retention vs compression</li>
<li><strong>More stable training:</strong> Reduces pressure toward KL=0</li>
</ul>
<br>
<strong>Typical values:</strong> λ = 0.0005 to 0.002 nats per latent dimension''',
        'category': 'Posterior Collapse',
        'code': '''def vae_loss_with_free_nats(x, x_hat, mu, logvar,
                             beta=1.0, kl_free_nats=0.0):
    recon_loss = F.mse_loss(x_hat, x, reduction='mean')

    # KL per sample
    kl_per_sample = -0.5 * torch.sum(
        1 + logvar - mu.pow(2) - logvar.exp(), dim=1
    )

    # Apply free nats threshold
    kl_per_sample = torch.clamp(kl_per_sample - kl_free_nats, min=0.0)
    kl_loss = kl_per_sample.mean()

    return recon_loss + beta * kl_loss'''
    },
    {
        'question': 'What are signs of a healthy (non-collapsed) VAE during training?',
        'answer': '''<strong>Indicators of healthy VAE training:</strong>
<br><br>
<strong>KL divergence metrics:</strong>
<ul>
<li><strong>Non-zero KL:</strong> Should be > 5-15 nats (depends on latent_dim)</li>
<li><strong>Gradual decrease:</strong> KL decreases slowly over training, not suddenly</li>
<li><strong>Per-dimension activity:</strong> KL / latent_dim ≈ 0.1-0.5 nats</li>
</ul>
<br>
<strong>Reconstruction quality:</strong>
<ul>
<li>Reconstructions should improve over time</li>
<li>Different inputs produce different reconstructions</li>
</ul>
<br>
<strong>Generation quality:</strong>
<ul>
<li>Sampling z ~ N(0, I) produces diverse, coherent images</li>
<li>Interpolation in latent space shows smooth transitions</li>
</ul>
<br>
<strong>Warning signs:</strong> KL < 1, sudden drops, or KL ≈ 0.001 indicate collapse''',
        'category': 'Posterior Collapse',
        'code': ''
    },
    {
        'question': 'What strategies can prevent posterior collapse?',
        'answer': '''<strong>Multiple strategies</strong> to prevent posterior collapse:
<br><br>
<strong>1. Beta warmup:</strong> Gradually increase β from 0 to target
<br><br>
<strong>2. KL-free nats:</strong> Allow small KL without penalty
<br><br>
<strong>3. Smaller latent dimension:</strong> Reduce capacity forces encoder to be selective
<br><br>
<strong>4. Lower β (β-VAE):</strong> Use β < 1 (e.g., 0.5-0.8)
<br><br>
<strong>5. Stronger encoder:</strong> Give encoder more capacity than decoder
<br><br>
<strong>6. Gradient clipping:</strong> Prevent unstable KL gradients
<br><br>
<strong>7. Cyclic annealing:</strong> Cycle β between low and high values
<br><br>
<strong>8. Early stopping on KL:</strong> Stop training if KL drops too low
<br><br>
<strong>Best practice:</strong> Combine beta warmup + KL-free nats + gradient clipping''',
        'category': 'Posterior Collapse',
        'code': ''
    },

    # ===== BETA-VAE =====
    {
        'question': 'What is a β-VAE (beta-VAE)?',
        'answer': '''<strong>β-VAE</strong> is a VAE variant with adjustable β weight on the KL term.
<br><br>
<strong>Loss:</strong> L = Reconstruction + β × KL
<br><br>
<strong>Different β values:</strong>
<ul>
<li><strong>β < 1:</strong> Emphasizes reconstruction over regularization (sharper images, less disentanglement)</li>
<li><strong>β = 1:</strong> Standard VAE (ELBO optimization)</li>
<li><strong>β > 1:</strong> Emphasizes disentanglement over reconstruction (more independent latent factors)</li>
</ul>
<br>
<strong>Trade-off:</strong>
<ul>
<li><strong>Low β (0.1-0.8):</strong> Better reconstruction, risk of posterior collapse</li>
<li><strong>High β (2-10):</strong> Better disentanglement, worse reconstruction</li>
</ul>''',
        'category': 'VAE Variants',
        'code': ''
    },
    {
        'question': 'What is disentanglement in VAE latent spaces?',
        'answer': '''<strong>Disentanglement</strong> means individual latent dimensions correspond to independent factors of variation in the data.
<br><br>
<strong>Example (faces):</strong>
<ul>
<li>z[0] controls pose</li>
<li>z[1] controls lighting</li>
<li>z[2] controls hair color</li>
<li>Each dimension is independent</li>
</ul>
<br>
<strong>Benefits:</strong>
<ul>
<li><strong>Interpretability:</strong> Can understand what each dimension does</li>
<li><strong>Controllability:</strong> Change one factor without affecting others</li>
<li><strong>Transfer learning:</strong> Useful features for downstream tasks</li>
</ul>
<br>
<strong>Achieving disentanglement:</strong>
<ul>
<li>Use β > 1 (β-VAE) to encourage independence</li>
<li>Other methods: FactorVAE, TC-VAE</li>
</ul>''',
        'category': 'VAE Variants',
        'code': ''
    },

    # ===== IMPLEMENTATION DETAILS =====
    {
        'question': 'Why use logvar instead of directly predicting variance in VAEs?',
        'answer': '''<strong>Using log(σ²) instead of σ² directly</strong> has several advantages:
<br><br>
<strong>Numerical stability:</strong>
<ul>
<li>Variance must be positive: σ² > 0</li>
<li>log(σ²) can be any real number, easier to optimize</li>
<li>Prevents σ² from becoming negative during training</li>
</ul>
<br>
<strong>Implementation benefits:</strong>
<ul>
<li><strong>Reparameterization:</strong> σ = exp(0.5 × logvar) is numerically stable</li>
<li><strong>KL divergence:</strong> Formula simplifies with logvar term</li>
<li><strong>Gradient flow:</strong> Better gradients through exponential</li>
</ul>
<br>
<strong>Range:</strong> logvar ∈ (-∞, ∞) maps to σ² ∈ (0, ∞)''',
        'category': 'Implementation',
        'code': '''# In encoder
self.fc_logvar = nn.Linear(hidden_dim, latent_dim)

# In forward
mu, logvar = self.encoder(x)
std = torch.exp(0.5 * logvar)  # Convert to std
z = mu + std * eps             # Reparameterize'''
    },
    {
        'question': 'How do you sample from a trained VAE to generate new images?',
        'answer': '''<strong>Generation process:</strong> Sample from the prior and decode
<br><br>
<strong>Steps:</strong>
<ol>
<li><strong>Sample from prior:</strong> z ~ N(0, I) using torch.randn</li>
<li><strong>Decode:</strong> x_generated = decoder(z)</li>
<li><strong>Visualize:</strong> Convert tensor to image</li>
</ol>
<br>
<strong>Why this works:</strong>
<ul>
<li>Training forces encoder outputs q(z|x) ≈ p(z) = N(0, I)</li>
<li>Decoder learns p(x|z), mapping latent codes to images</li>
<li>Sampling from p(z) and decoding gives p(x) = ∫ p(x|z)p(z)dz</li>
</ul>
<br>
<strong>Note:</strong> Quality depends on whether posterior collapse occurred!''',
        'category': 'Implementation',
        'code': '''def sample_from_vae(vae, n_samples=8):
    vae.eval()
    with torch.no_grad():
        # Sample from prior N(0, I)
        z = torch.randn(n_samples, latent_dim).to(device)

        # Decode
        x_generated = vae.decoder(z)

    return x_generated  # Shape: [n_samples, C, H, W]'''
    },
    {
        'question': 'What is latent space interpolation and what does it demonstrate?',
        'answer': '''<strong>Latent space interpolation</strong> generates intermediate images by linearly interpolating between two latent codes.
<br><br>
<strong>Process:</strong>
<ol>
<li>Encode two images: z1 = encoder(x1), z2 = encoder(x2)</li>
<li>Interpolate: z_t = (1-t)×z1 + t×z2 for t ∈ [0, 1]</li>
<li>Decode interpolated codes: x_t = decoder(z_t)</li>
</ol>
<br>
<strong>What it demonstrates:</strong>
<ul>
<li><strong>Smooth latent space:</strong> Nearby points → similar images</li>
<li><strong>Meaningful structure:</strong> Interpolation shows gradual transitions</li>
<li><strong>Quality check:</strong> Smooth interpolations indicate good training</li>
</ul>
<br>
<strong>Spherical interpolation (SLERP)</strong> can be used for better results than linear.''',
        'category': 'Implementation',
        'code': '''def interpolate(vae, x1, x2, steps=8):
    vae.eval()
    with torch.no_grad():
        mu1, _ = vae.encoder(x1)
        mu2, _ = vae.encoder(x2)

        results = []
        for alpha in torch.linspace(0, 1, steps):
            z = (1 - alpha) * mu1 + alpha * mu2
            x_interp = vae.decoder(z)
            results.append(x_interp)

    return results'''
    },
    {
        'question': 'Why use Sigmoid activation at the decoder output?',
        'answer': '''<strong>Sigmoid ensures output is in [0, 1] range</strong> matching normalized image pixel values.
<br><br>
<strong>Reasoning:</strong>
<ul>
<li><strong>Input normalization:</strong> ToTensor() converts images to [0, 1]</li>
<li><strong>Loss computation:</strong> MSE/BCE expect values in [0, 1]</li>
<li><strong>Bounded output:</strong> Prevents decoder from outputting arbitrary values</li>
</ul>
<br>
<strong>Alternatives:</strong>
<ul>
<li><strong>Tanh + scaling:</strong> If images normalized to [-1, 1]</li>
<li><strong>No activation:</strong> If using unnormalized pixels (not recommended)</li>
</ul>
<br>
<strong>In code:</strong> Final layer is nn.ConvTranspose2d → nn.Sigmoid()''',
        'category': 'Implementation',
        'code': '''# Decoder final layer
self.net = nn.Sequential(
    # ... previous layers ...
    nn.ConvTranspose2d(base_channels, out_channels, 4, 2, 1),
    nn.Sigmoid()  # Ensures output in [0, 1]
)'''
    },

    # ===== TRAINING CONSIDERATIONS =====
    {
        'question': 'What are typical hyperparameters for training a VAE?',
        'answer': '''<strong>Key hyperparameters</strong> from the assignment:
<br><br>
<strong>Architecture:</strong>
<ul>
<li><strong>latent_dim:</strong> 64-128 (smaller helps prevent collapse)</li>
<li><strong>base_channels:</strong> 32-64 (encoder/decoder capacity)</li>
</ul>
<br>
<strong>Optimization:</strong>
<ul>
<li><strong>Learning rate:</strong> 7e-4 to 1e-3 (Adam optimizer)</li>
<li><strong>Batch size:</strong> 128</li>
<li><strong>Epochs:</strong> 35-50</li>
</ul>
<br>
<strong>Regularization:</strong>
<ul>
<li><strong>β (target):</strong> 0.6-3.0</li>
<li><strong>β warmup:</strong> Start at 0, ramp over 25-35 epochs</li>
<li><strong>KL-free nats:</strong> 0.0005-0.002</li>
<li><strong>Gradient clipping:</strong> 1.0-2.0</li>
</ul>''',
        'category': 'Training',
        'code': ''
    },
    {
        'question': 'What is the ELBO (Evidence Lower Bound) in VAEs?',
        'answer': '''<strong>ELBO</strong> is the objective maximized by VAE training (equivalently, minimize -ELBO).
<br><br>
<strong>Full form:</strong>
ELBO = E_q(z|x)[log p(x|z)] - KL(q(z|x) || p(z))
<br><br>
<strong>Components:</strong>
<ul>
<li><strong>E_q(z|x)[log p(x|z)]:</strong> Expected reconstruction likelihood (approximated by single sample)</li>
<li><strong>KL(q(z|x) || p(z)):</strong> Divergence between posterior and prior</li>
</ul>
<br>
<strong>Why "lower bound"?</strong>
<ul>
<li>True objective: log p(x) (intractable)</li>
<li>ELBO ≤ log p(x) (Jensen's inequality)</li>
<li>Maximizing ELBO approximates maximizing log-likelihood</li>
</ul>
<br>
<strong>In practice:</strong> -ELBO = Reconstruction_loss + KL_loss''',
        'category': 'VAE Fundamentals',
        'code': ''
    },
    {
        'question': 'How does VAE differ from a standard autoencoder in terms of usage?',
        'answer': '''<strong>Key differences between VAE and standard AE:</strong>
<br><br>
<strong>Standard Autoencoder:</strong>
<ul>
<li><strong>Purpose:</strong> Dimensionality reduction, denoising</li>
<li><strong>Latent space:</strong> Deterministic, potentially sparse/irregular</li>
<li><strong>Generation:</strong> Poor - sampling random z produces garbage</li>
<li><strong>Training:</strong> Only reconstruction loss</li>
</ul>
<br>
<strong>VAE:</strong>
<ul>
<li><strong>Purpose:</strong> Generative modeling</li>
<li><strong>Latent space:</strong> Probabilistic, continuous, well-structured</li>
<li><strong>Generation:</strong> Good - can sample z ~ N(0,I) for new images</li>
<li><strong>Training:</strong> Reconstruction + KL divergence</li>
</ul>
<br>
<strong>Use VAE when:</strong> You need generation, interpolation, or a smooth latent space
<br>
<strong>Use AE when:</strong> You only need compression or feature extraction''',
        'category': 'Comparison',
        'code': ''
    },
    {
        'question': 'What happens during the forward pass of a VAE?',
        'answer': '''<strong>VAE forward pass</strong> involves encoding, sampling, and decoding:
<br><br>
<strong>Steps:</strong>
<ol>
<li><strong>Encode:</strong> (μ, logvar) = encoder(x)</li>
<li><strong>Reparameterize:</strong> z = μ + exp(0.5×logvar) × ε, where ε ~ N(0,I)</li>
<li><strong>Decode:</strong> x_hat = decoder(z)</li>
<li><strong>Return:</strong> x_hat, μ, logvar, z</li>
</ol>
<br>
<strong>Key points:</strong>
<ul>
<li>Stochastic during training (sampling ε)</li>
<li>Can be deterministic at test time (use μ directly)</li>
<li>All outputs needed for loss computation</li>
</ul>''',
        'category': 'Implementation',
        'code': '''def forward(self, x):
    # Encode to distribution parameters
    mu, logvar = self.encoder(x)

    # Sample latent code
    z = self.reparameterize(mu, logvar)

    # Decode
    x_hat = self.decoder(z)

    return x_hat, mu, logvar, z'''
    },
    {
        'question': 'Why might you decrease the latent dimension to prevent collapse?',
        'answer': '''<strong>Smaller latent dimension</strong> forces the model to use available capacity efficiently:
<br><br>
<strong>Mechanism:</strong>
<ul>
<li><strong>Limited capacity:</strong> Fewer dimensions = less room to waste</li>
<li><strong>Information bottleneck:</strong> Must use each dimension meaningfully</li>
<li><strong>Higher utilization:</strong> Can't afford to have KL ≈ 0 for all dimensions</li>
</ul>
<br>
<strong>Example:</strong>
<ul>
<li>latent_dim=256: Decoder can ignore most dimensions → collapse likely</li>
<li>latent_dim=64: Decoder needs all dimensions → collapse less likely</li>
</ul>
<br>
<strong>Trade-off:</strong> Too small may limit model expressiveness
<br><br>
<strong>Best practice:</strong> Start with smaller dimension (64-128), increase if needed''',
        'category': 'Posterior Collapse',
        'code': ''
    },

    # ===== EVALUATION & ANALYSIS =====
    {
        'question': 'How do you evaluate VAE performance?',
        'answer': '''<strong>Multiple metrics</strong> for comprehensive VAE evaluation:
<br><br>
<strong>Quantitative metrics:</strong>
<ul>
<li><strong>Reconstruction loss:</strong> Lower is better (but too low may indicate collapse)</li>
<li><strong>KL divergence:</strong> Should be non-zero (5-30 nats typically healthy)</li>
<li><strong>ELBO:</strong> Total loss on validation set</li>
<li><strong>Per-dimension KL:</strong> Check if dimensions are being used (KL/latent_dim)</li>
</ul>
<br>
<strong>Qualitative evaluation:</strong>
<ul>
<li><strong>Reconstruction quality:</strong> Visual inspection of x vs x_hat</li>
<li><strong>Generation quality:</strong> Sample z ~ N(0,I) and check coherence</li>
<li><strong>Interpolation smoothness:</strong> Check latent space structure</li>
<li><strong>Disentanglement:</strong> Vary individual z dimensions</li>
</ul>''',
        'category': 'Evaluation',
        'code': ''
    },
    {
        'question': 'What should you monitor during VAE training to detect collapse?',
        'answer': '''<strong>Warning signals</strong> to watch during training:
<br><br>
<strong>Critical metrics:</strong>
<ul>
<li><strong>KL divergence trend:</strong> Watch for sudden drops (collapse indicator)</li>
<li><strong>KL absolute value:</strong> If KL < 1, likely collapsed</li>
<li><strong>KL per dimension:</strong> Should be ~0.1-0.5 nats/dim</li>
</ul>
<br>
<strong>Secondary indicators:</strong>
<ul>
<li><strong>Reconstruction loss:</strong> If it stops improving, may indicate issues</li>
<li><strong>Training dynamics:</strong> Check if loss is stable or oscillating</li>
</ul>
<br>
<strong>Best practice:</strong>
<ul>
<li>Print KL and recon loss separately each epoch</li>
<li>Plot KL over time to catch sudden drops</li>
<li>Periodically sample from prior to check generation</li>
</ul>''',
        'category': 'Training',
        'code': '''# Example training output
print(f"[Epoch {epoch}] "
      f"val={val:.4f} "
      f"(rec={val_rec:.4f}, kl={val_kl:.4f}) "
      f"beta={beta:.3f}")

# Red flags:
# kl < 1.0 → potential collapse
# sudden drop in kl → collapse happening
# kl / latent_dim < 0.01 → collapsed'''
    },
    {
        'question': 'What is the relationship between model capacity and posterior collapse?',
        'answer': '''<strong>Model capacity</strong> (encoder/decoder size) significantly affects collapse risk:
<br><br>
<strong>Decoder capacity:</strong>
<ul>
<li><strong>Powerful decoder:</strong> Can reconstruct well even with uninformative z → higher collapse risk</li>
<li><strong>Weak decoder:</strong> Needs informative z to reconstruct → lower collapse risk</li>
</ul>
<br>
<strong>Encoder capacity:</strong>
<ul>
<li><strong>Powerful encoder:</strong> Can learn complex posteriors → lower collapse risk</li>
<li><strong>Weak encoder:</strong> May default to simple solution (prior) → higher collapse risk</li>
</ul>
<br>
<strong>Architectural balance:</strong>
<ul>
<li>Encoder should be ≥ decoder capacity</li>
<li>In this assignment: both use same base_channels</li>
</ul>''',
        'category': 'Posterior Collapse',
        'code': ''
    },

    # ===== ADVANCED CONCEPTS =====
    {
        'question': 'What is the difference between mu and z in a VAE?',
        'answer': '''<strong>μ (mu) vs z</strong> represent different aspects of the latent code:
<br><br>
<strong>μ (mean):</strong>
<ul>
<li><strong>Deterministic:</strong> Direct output of encoder</li>
<li><strong>Meaning:</strong> Center of the posterior distribution q(z|x)</li>
<li><strong>Usage:</strong> At test time, often use μ directly (deterministic encoding)</li>
<li><strong>Gradients:</strong> Flows directly from encoder</li>
</ul>
<br>
<strong>z (latent code):</strong>
<ul>
<li><strong>Stochastic:</strong> Sampled from N(μ, σ²)</li>
<li><strong>Meaning:</strong> Actual latent representation used for decoding</li>
<li><strong>Usage:</strong> Always used during training</li>
<li><strong>Gradients:</strong> Flow via reparameterization trick</li>
</ul>
<br>
<strong>Relationship:</strong> z = μ + σ × ε, where ε ~ N(0, I)''',
        'category': 'VAE Fundamentals',
        'code': ''
    },
    {
        'question': 'Why use convolutional layers instead of fully-connected layers for image VAEs?',
        'answer': '''<strong>Convolutional architectures</strong> are superior for image data:
<br><br>
<strong>Advantages:</strong>
<ul>
<li><strong>Spatial structure:</strong> Convolutions preserve 2D relationships in images</li>
<li><strong>Parameter efficiency:</strong> Far fewer parameters than FC layers</li>
<li><strong>Translation invariance:</strong> Same features detected anywhere in image</li>
<li><strong>Local features:</strong> Natural for learning edge, texture, object parts</li>
</ul>
<br>
<strong>Comparison (32×32×3 image, 128 latent):</strong>
<ul>
<li><strong>FC encoder:</strong> 3,072 × hidden × 128 = millions of parameters</li>
<li><strong>Conv encoder:</strong> Small kernels (4×4) = thousands of parameters</li>
</ul>
<br>
<strong>Architecture choice:</strong>
<ul>
<li><strong>Images:</strong> Use conv layers (this assignment)</li>
<li><strong>Tabular/1D:</strong> Use FC layers</li>
</ul>''',
        'category': 'Architecture',
        'code': ''
    },
    {
        'question': 'What does the convolution stride of 2 accomplish in the encoder?',
        'answer': '''<strong>Stride 2 downsamples the spatial dimensions</strong> progressively:
<br><br>
<strong>In the encoder:</strong>
<ul>
<li>Input: 32×32 (CIFAR-10)</li>
<li>After Conv1 (stride 2): 16×16</li>
<li>After Conv2 (stride 2): 8×8</li>
<li>After Conv3 (stride 2): 4×4</li>
</ul>
<br>
<strong>Purpose:</strong>
<ul>
<li><strong>Dimensionality reduction:</strong> 32×32×3 = 3,072 → 4×4×128 = 2,048 features</li>
<li><strong>Hierarchical features:</strong> Early layers = edges, later = objects</li>
<li><strong>Computational efficiency:</strong> Reduces spatial size for faster computation</li>
</ul>
<br>
<strong>Decoder mirrors this:</strong> ConvTranspose with stride 2 upsamples back to 32×32''',
        'category': 'Architecture',
        'code': '''# Encoder downsampling
nn.Conv2d(in_channels, base_channels, kernel=4, stride=2, padding=1)
# Output size = (input_size + 2*padding - kernel) / stride + 1
# = (32 + 2*1 - 4) / 2 + 1 = 16'''
    },
    {
        'question': 'How would you modify the VAE for conditional generation?',
        'answer': '''<strong>Conditional VAE (CVAE)</strong> generates samples conditioned on class labels or other information:
<br><br>
<strong>Modifications:</strong>
<ol>
<li><strong>Encoder input:</strong> Concatenate [x, c] where c is condition (e.g., one-hot class)</li>
<li><strong>Decoder input:</strong> Concatenate [z, c] before decoding</li>
<li><strong>Training:</strong> Same VAE loss, but p(x|z,c) and q(z|x,c)</li>
</ol>
<br>
<strong>Benefits:</strong>
<ul>
<li><strong>Controlled generation:</strong> Sample specific classes</li>
<li><strong>Better separation:</strong> Latent space organized by condition</li>
<li><strong>Class-specific reconstruction:</strong> Can improve quality</li>
</ul>
<br>
<strong>Use case:</strong> Generate CIFAR-10 images of specific classes (airplane, car, etc.)''',
        'category': 'VAE Variants',
        'code': '''class CVAE(nn.Module):
    def forward(self, x, c):
        # Encode with condition
        h = torch.cat([x, c], dim=1)
        mu, logvar = self.encoder(h)

        # Sample
        z = self.reparameterize(mu, logvar)

        # Decode with condition
        z_c = torch.cat([z, c], dim=1)
        x_hat = self.decoder(z_c)

        return x_hat, mu, logvar, z'''
    },
    {
        'question': 'What are typical KL divergence values for a well-trained VAE?',
        'answer': '''<strong>Healthy KL values</strong> depend on latent dimension and dataset:
<br><br>
<strong>General guidelines:</strong>
<ul>
<li><strong>Total KL:</strong> 5-30 nats for image VAEs</li>
<li><strong>Per dimension:</strong> 0.1-0.5 nats/dim</li>
<li><strong>Active dimensions:</strong> Most dimensions should contribute (not all zero)</li>
</ul>
<br>
<strong>Examples from assignment:</strong>
<ul>
<li><strong>Healthy:</strong> latent_dim=64, KL=15-30 → ~0.25-0.5 nats/dim ✓</li>
<li><strong>Collapsed:</strong> latent_dim=128, KL=0.001 → ~0.000008 nats/dim ✗</li>
</ul>
<br>
<strong>Warning thresholds:</strong>
<ul>
<li>KL < 1 → Likely collapsed</li>
<li>KL > 100 → May be overly compressed (β too high)</li>
</ul>''',
        'category': 'Evaluation',
        'code': ''
    },
    {
        'question': 'What is the purpose of the flatten operation in the encoder?',
        'answer': '''<strong>Flattening</strong> converts spatial feature maps to a 1D vector for the fully-connected layer:
<br><br>
<strong>Transformation:</strong>
<ul>
<li><strong>Before flatten:</strong> Shape = [batch, channels, height, width]</li>
<li><strong>After flatten:</strong> Shape = [batch, channels × height × width]</li>
</ul>
<br>
<strong>Example (CIFAR-10):</strong>
<ul>
<li>After conv layers: [batch, 256, 4, 4]</li>
<li>After flatten: [batch, 4096]</li>
<li>Then FC layer: [batch, 4096] → [batch, latent_dim]</li>
</ul>
<br>
<strong>Decoder does reverse:</strong>
<ul>
<li>FC layer: [batch, latent_dim] → [batch, 4096]</li>
<li>Reshape: [batch, 4096] → [batch, 256, 4, 4]</li>
<li>Then transposed convs upsample to 32×32</li>
</ul>''',
        'category': 'Architecture',
        'code': '''# In encoder
h = self.net(x)              # [B, 256, 4, 4]
h = h.view(h.size(0), -1)    # [B, 4096]
mu = self.fc_mu(h)           # [B, latent_dim]

# In decoder
h = self.fc(z)               # [B, 4096]
h = h.view(h.size(0), 256, 4, 4)  # [B, 256, 4, 4]
x = self.net(h)              # [B, 3, 32, 32]'''
    },

    # ===== PRACTICAL TIPS =====
    {
        'question': 'What configuration was chosen as best in the assignment and why?',
        'answer': '''<strong>Config 2 (Medium model)</strong> was selected:
<br><br>
<strong>Hyperparameters:</strong>
<ul>
<li>latent_dim = 128</li>
<li>base_channels = 64</li>
<li>β = 1.0 (after warmup)</li>
<li>Learning rate = 8e-4</li>
</ul>
<br>
<strong>Reasoning:</strong>
<ul>
<li><strong>Best validation loss:</strong> Lowest among all configurations</li>
<li><strong>Non-zero KL:</strong> Avoided posterior collapse</li>
<li><strong>Balance:</strong> Good reconstruction quality + meaningful latent space</li>
<li><strong>Efficiency:</strong> Reasonable training time (~400s total)</li>
</ul>
<br>
<strong>Trade-offs considered:</strong>
<ul>
<li>Config 1: Faster but less capacity</li>
<li>Config 3: More disentanglement but worse reconstruction</li>
</ul>''',
        'category': 'Training',
        'code': ''
    },
    {
        'question': 'What does gradient clipping do in VAE training?',
        'answer': '''<strong>Gradient clipping</strong> limits the magnitude of gradients to prevent unstable training:
<br><br>
<strong>Implementation:</strong>
<ul>
<li>Compute gradient norm: ||g|| = sqrt(Σ g_i²)</li>
<li>If ||g|| > threshold, scale down: g ← g × (threshold / ||g||)</li>
<li>Typical threshold: 1.0-2.0</li>
</ul>
<br>
<strong>Why needed for VAEs:</strong>
<ul>
<li><strong>KL gradients:</strong> Can be large/unstable, especially with high β</li>
<li><strong>Prevents collapse:</strong> Stops sudden jumps in encoder parameters</li>
<li><strong>Stabilizes training:</strong> Smoother optimization trajectory</li>
</ul>
<br>
<strong>Best practice:</strong> Combine with beta warmup for most stable training''',
        'category': 'Training',
        'code': '''# In training loop
loss.backward()

# Clip gradients
torch.nn.utils.clip_grad_norm_(
    model.parameters(),
    max_norm=1.5
)

optimizer.step()'''
    },
    {
        'question': 'How do you interpret reconstruction vs KL loss during training?',
        'answer': '''<strong>Understanding the loss components</strong> reveals training dynamics:
<br><br>
<strong>Reconstruction loss (MSE):</strong>
<ul>
<li><strong>Decreasing:</strong> Model learning to reconstruct better</li>
<li><strong>Too low:</strong> May be overfitting or collapse (decoder ignoring z)</li>
<li><strong>Stuck:</strong> May need more capacity or different architecture</li>
</ul>
<br>
<strong>KL divergence:</strong>
<ul>
<li><strong>High initially:</strong> Normal - encoder outputs informative codes</li>
<li><strong>Gradual decrease:</strong> Healthy - regularization taking effect</li>
<li><strong>Sudden drop to ~0:</strong> COLLAPSE! Encoder outputting prior</li>
<li><strong>Stays moderate:</strong> Ideal - using latent capacity meaningfully</li>
</ul>
<br>
<strong>Healthy pattern:</strong> Both decrease slowly over time, KL stays > 5''',
        'category': 'Training',
        'code': ''
    },
    {
        'question': 'Why was beta warmup unsuccessful in the assignment initially?',
        'answer': '''<strong>Beta warmup failed</strong> because it was too aggressive:
<br><br>
<strong>Original schedule (collapsed):</strong>
<ul>
<li>Hold β=0 for 10 epochs (learned like standard AE)</li>
<li>Ramp to β=0.8 over 30 epochs</li>
<li>Result: KL dropped from ~1000 to 0.001 at epoch 11</li>
</ul>
<br>
<strong>What went wrong:</strong>
<ul>
<li><strong>Decoder became too powerful:</strong> Learned to reconstruct from noise during β=0 phase</li>
<li><strong>Sudden regularization:</strong> When β started increasing, KL was forced to 0</li>
<li><strong>Local minimum:</strong> Collapsed state was a stable solution</li>
</ul>
<br>
<strong>Better approach used:</strong>
<ul>
<li>Small constant β=0.0008 (no warmup)</li>
<li>Prevents decoder from ignoring z from the start</li>
</ul>''',
        'category': 'Posterior Collapse',
        'code': ''
    },
]

# Add all cards to deck
for card_data in cards:
    note = genanki.Note(
        model=model,
        fields=[
            card_data['question'],
            card_data['answer'],
            card_data['category'],
            card_data.get('code', '')
        ]
    )
    deck.add_note(note)

# Generate the deck
output_file = 'VAE_Autoencoders_Deep_Learning.apkg'
genanki.Package(deck).write_to_file(output_file)

print(f"Successfully generated Anki deck: {output_file}")
print(f"Total cards: {len(cards)}")
print("\nCards by category:")
categories = {}
for card in cards:
    cat = card['category']
    categories[cat] = categories.get(cat, 0) + 1

for cat, count in sorted(categories.items()):
    print(f"  {cat}: {count} cards")