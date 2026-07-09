from app.core.protobuf_parser import ProtobufParser


def test_protobuf_parser_extracts_messages_enums_services_rpcs_and_docs(tmp_path):
    source = tmp_path / "payments.proto"
    source.write_text(
        'syntax = "proto3";\n'
        "package ledger.payments.v1;\n"
        "\n"
        'import "common/money.proto";\n'
        "\n"
        "// Payment event payload.\n"
        "message PaymentEvent {\n"
        "  string id = 1;\n"
        "  Money amount = 2;\n"
        "}\n"
        "\n"
        "enum PaymentState {\n"
        "  PAYMENT_STATE_UNSPECIFIED = 0;\n"
        "  PAYMENT_STATE_CAPTURED = 1;\n"
        "}\n"
        "\n"
        "// Payment API.\n"
        "service PaymentService {\n"
        "  // Capture one payment.\n"
        "  rpc CapturePayment (PaymentEvent) returns (PaymentEvent);\n"
        "  rpc StreamPayments (PaymentEvent) returns (stream PaymentEvent) {}\n"
        "}\n",
        encoding="utf-8",
    )

    parsed = ProtobufParser().parse_file(str(source))

    assert parsed is not None
    assert parsed.package == "ledger.payments.v1"
    definitions = {(definition.kind, definition.name): definition for definition in parsed.definitions}
    assert definitions[("message", "PaymentEvent")].docstring == "Payment event payload."
    assert ("enum", "PaymentState") in definitions
    assert definitions[("service", "PaymentService")].docstring == "Payment API."
    rpcs = {rpc.name: rpc for rpc in definitions[("service", "PaymentService")].rpcs}
    assert rpcs["CapturePayment"].docstring == "Capture one payment."
    assert "returns (PaymentEvent)" in rpcs["CapturePayment"].code
    assert "StreamPayments" in rpcs
