from app.core.swift_parser import SwiftParser


def test_swift_parser_extracts_types_members_top_level_symbols_and_docs(tmp_path):
    source = tmp_path / "Payments.swift"
    source.write_text(
        "import Foundation\n"
        "\n"
        "/// Stores one payment.\n"
        "struct PaymentRecord: Codable {\n"
        "  /// External payment id.\n"
        "  let id: String\n"
        "  let amount: Decimal\n"
        "}\n"
        "\n"
        "/// Reads payments.\n"
        "protocol PaymentRepository {\n"
        "  /// Load by id.\n"
        "  func findById(_ id: String) async throws -> PaymentRecord?\n"
        "}\n"
        "\n"
        "/// Payment routes.\n"
        "final class PaymentRoutes {\n"
        "  func buildRoutes(repository: PaymentRepository) -> String { \"ok\" }\n"
        "  private func normalize(_ id: String) -> String { id.trimmingCharacters(in: .whitespaces) }\n"
        "}\n"
        "\n"
        "enum PaymentState {\n"
        "  case pending\n"
        "  case captured\n"
        "}\n"
        "\n"
        "actor PaymentActor {\n"
        "  func run() async {}\n"
        "}\n"
        "\n"
        "extension PaymentRoutes {\n"
        "  static func preview() -> PaymentRoutes { PaymentRoutes() }\n"
        "}\n"
        "\n"
        "/// Top-level token.\n"
        "let swiftLanguageMatrixToken = \"swiftlangkappa\"\n"
        "func topLevelHealth() -> String { \"ok\" }\n",
        encoding="utf-8",
    )

    parsed = SwiftParser().parse_file(str(source))

    assert parsed is not None
    functions = {function.name: function for function in parsed.functions}
    assert "topLevelHealth" in functions

    properties = {property_symbol.name: property_symbol for property_symbol in parsed.properties}
    assert properties["swiftLanguageMatrixToken"].docstring == "Top-level token."

    types = {swift_type.name: swift_type for swift_type in parsed.types}
    assert types["PaymentRecord"].kind == "struct"
    assert types["PaymentRecord"].docstring == "Stores one payment."
    assert types["PaymentRepository"].kind == "protocol"
    assert types["PaymentRepository"].docstring == "Reads payments."
    assert types["PaymentRoutes"].kind == "class"
    assert types["PaymentRoutes"].docstring == "Payment routes."
    assert types["PaymentState"].kind == "enum"
    assert types["PaymentActor"].kind == "actor"

    record_members = {member.name: member for member in types["PaymentRecord"].members}
    assert record_members["id"].kind == "property"
    assert record_members["id"].docstring == "External payment id."
    repository_methods = {member.name: member for member in types["PaymentRepository"].members}
    assert repository_methods["findById"].docstring == "Load by id."
    route_methods = {member.name for member in types["PaymentRoutes"].members}
    assert {"buildRoutes", "normalize"}.issubset(route_methods)
