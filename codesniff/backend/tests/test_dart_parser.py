from app.core.dart_parser import DartParser


def test_dart_parser_extracts_types_members_top_level_symbols_and_docs(tmp_path):
    source = tmp_path / "payments.dart"
    source.write_text(
        "import 'package:flutter/widgets.dart';\n"
        "\n"
        "/// Stores one payment.\n"
        "class PaymentRecord {\n"
        "  /// External payment id.\n"
        "  final String id;\n"
        "  final double amount;\n"
        "\n"
        "  const PaymentRecord(this.id, this.amount);\n"
        "\n"
        "  String label() => '$id:$amount';\n"
        "}\n"
        "\n"
        "/// Reads payments.\n"
        "abstract class PaymentRepository {\n"
        "  /// Load by id.\n"
        "  Future<PaymentRecord?> findById(String id);\n"
        "}\n"
        "\n"
        "enum PaymentState { pending, captured }\n"
        "\n"
        "mixin PaymentLogger {\n"
        "  void logPayment(String id) {}\n"
        "}\n"
        "\n"
        "extension PaymentRecordFormat on PaymentRecord {\n"
        "  String formatted() => label();\n"
        "}\n"
        "\n"
        "/// Top-level token.\n"
        "final dartLanguageMatrixToken = 'dartlanglambda';\n"
        "String topLevelHealth() => 'ok';\n",
        encoding="utf-8",
    )

    parsed = DartParser().parse_file(str(source))

    assert parsed is not None
    functions = {function.name: function for function in parsed.functions}
    assert "topLevelHealth" in functions

    properties = {property_symbol.name: property_symbol for property_symbol in parsed.properties}
    assert properties["dartLanguageMatrixToken"].docstring == "Top-level token."

    types = {dart_type.name: dart_type for dart_type in parsed.types}
    assert types["PaymentRecord"].kind == "class"
    assert types["PaymentRecord"].docstring == "Stores one payment."
    assert types["PaymentRepository"].kind == "class"
    assert types["PaymentRepository"].docstring == "Reads payments."
    assert types["PaymentState"].kind == "enum"
    assert types["PaymentLogger"].kind == "mixin"
    assert types["PaymentRecordFormat"].kind == "extension"

    record_members = {member.name: member for member in types["PaymentRecord"].members}
    assert record_members["id"].kind == "property"
    assert record_members["id"].docstring == "External payment id."
    assert record_members["PaymentRecord"].kind == "constructor"
    assert record_members["label"].kind == "method"
    repository_methods = {member.name: member for member in types["PaymentRepository"].members}
    assert repository_methods["findById"].docstring == "Load by id."
    logger_methods = {member.name for member in types["PaymentLogger"].members}
    assert "logPayment" in logger_methods
