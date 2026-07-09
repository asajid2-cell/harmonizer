from app.core.hcl_parser import HCLParser


def test_hcl_parser_extracts_terraform_blocks_attributes_and_docs(tmp_path):
    source = tmp_path / "main.tf"
    source.write_text(
        "# Stores remote state.\n"
        "terraform {\n"
        "  backend \"s3\" {\n"
        "    bucket = \"ledger-state\"\n"
        "  }\n"
        "}\n"
        "\n"
        "# AWS provider.\n"
        "provider \"aws\" {\n"
        "  region = var.region\n"
        "}\n"
        "\n"
        "# App module.\n"
        "module \"app\" {\n"
        "  source = \"../modules/app\"\n"
        "}\n"
        "\n"
        "# Assets bucket.\n"
        "resource \"aws_s3_bucket\" \"assets\" {\n"
        "  bucket = \"ledger-assets\"\n"
        "}\n"
        "\n"
        "data \"aws_iam_policy_document\" \"assume_role\" {\n"
        "  statement {}\n"
        "}\n"
        "\n"
        "variable \"region\" {\n"
        "  default = \"us-east-1\"\n"
        "}\n"
        "\n"
        "output \"bucket_name\" {\n"
        "  value = aws_s3_bucket.assets.bucket\n"
        "}\n",
        encoding="utf-8",
    )

    parsed = HCLParser().parse_file(str(source))

    assert parsed is not None
    blocks = {block.name: block for block in parsed.blocks}
    assert blocks["terraform"].kind == "terraform"
    assert blocks["terraform"].docstring == "Stores remote state."
    assert blocks["provider aws"].kind == "provider"
    assert blocks["provider aws"].docstring == "AWS provider."
    assert blocks["module app"].kind == "module"
    assert blocks["module app"].docstring == "App module."
    assert blocks["resource aws_s3_bucket.assets"].kind == "resource"
    assert blocks["resource aws_s3_bucket.assets"].labels == ["aws_s3_bucket", "assets"]
    assert blocks["data aws_iam_policy_document.assume_role"].kind == "data"
    assert blocks["variable region"].kind == "variable"
    assert blocks["output bucket_name"].kind == "output"


def test_hcl_parser_keeps_assignment_only_files_searchable(tmp_path):
    source = tmp_path / "service.hcl"
    source.write_text(
        "# Boundary service policy.\n"
        "service = \"hcllanguageeta2\"\n"
        "retries = 3\n",
        encoding="utf-8",
    )

    parsed = HCLParser().parse_file(str(source))

    assert parsed is not None
    attributes = {attribute.name: attribute for attribute in parsed.attributes}
    assert attributes["service"].docstring == "Boundary service policy."
    assert "hcllanguageeta2" in attributes["service"].code
    assert "retries" in attributes
