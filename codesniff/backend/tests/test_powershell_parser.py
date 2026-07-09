from app.core.powershell_parser import PowerShellParser


def test_powershell_parser_extracts_functions_types_members_variables_and_docs(tmp_path):
    source = tmp_path / "Deploy.psm1"
    source.write_text(
        "using module './Shared.psm1'\n"
        "# Deploy invoice workers.\n"
        "function Invoke-InvoiceDeploy {\n"
        "  param([string]$Environment)\n"
        "  Import-Module Pester\n"
        "  . ./private/common.ps1\n"
        "}\n"
        "\n"
        "<#\n"
        "Plan object.\n"
        "#>\n"
        "class DeploymentPlan {\n"
        "  [string] $Name\n"
        "  DeploymentPlan([string]$Name) { $this.Name = $Name }\n"
        "  [void] Apply() { }\n"
        "}\n"
        "\n"
        "enum DeploymentState {\n"
        "  Pending\n"
        "  Active\n"
        "}\n"
        "\n"
        "configuration BillingNode { }\n"
        "$script:PowerShellLanguageMatrixToken = 'powershell-symbol-token'\n",
        encoding="utf-8",
    )

    parsed = PowerShellParser().parse_file(str(source))

    assert parsed is not None
    assert parsed.total_lines == 24
    functions = {function.name: function for function in parsed.functions}
    assert functions["Invoke-InvoiceDeploy"].docstring == "Deploy invoice workers."
    assert "Import-Module Pester" in functions["Invoke-InvoiceDeploy"].code

    variables = {variable.name: variable for variable in parsed.variables}
    assert variables["PowerShellLanguageMatrixToken"].code.endswith("'powershell-symbol-token'")

    types = {(item.kind, item.name): item for item in parsed.types}
    assert types[("class", "DeploymentPlan")].docstring == "Plan object."
    assert ("enum", "DeploymentState") in types
    assert ("configuration", "BillingNode") in types

    members = {
        (member.kind, member.name)
        for member in types[("class", "DeploymentPlan")].members
    }
    assert members == {
        ("property", "Name"),
        ("constructor", "DeploymentPlan"),
        ("method", "Apply"),
    }
