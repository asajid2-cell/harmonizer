from app.core.graphql_parser import GraphQLParser


def test_graphql_parser_extracts_schema_types_operations_fragments_and_docs(tmp_path):
    source = tmp_path / "payments.graphql"
    source.write_text(
        "# Root operations.\n"
        "schema {\n"
        "  query: Query\n"
        "  mutation: Mutation\n"
        "}\n"
        "\n"
        "# Payment object.\n"
        "type Payment {\n"
        "  id: ID!\n"
        "  amount: Float!\n"
        "}\n"
        "\n"
        "extend type Payment {\n"
        "  status: PaymentState!\n"
        "}\n"
        "\n"
        "input PaymentInput {\n"
        "  amount: Float!\n"
        "}\n"
        "\n"
        "interface Node { id: ID! }\n"
        "enum PaymentState { PENDING CAPTURED }\n"
        "union SearchResult = Payment | Refund\n"
        "scalar DateTime\n"
        "directive @upper on FIELD_DEFINITION\n"
        "\n"
        "# Fetch one payment.\n"
        "query GetPayment($id: ID!) {\n"
        "  payment(id: $id) { ...PaymentFields }\n"
        "}\n"
        "\n"
        "mutation CapturePayment($input: PaymentInput!) {\n"
        "  capturePayment(input: $input) { id }\n"
        "}\n"
        "\n"
        "subscription PaymentCaptured { paymentCaptured { id } }\n"
        "fragment PaymentFields on Payment { id amount }\n",
        encoding="utf-8",
    )

    parsed = GraphQLParser().parse_file(str(source))

    assert parsed is not None
    definitions = {(definition.kind, definition.name): definition for definition in parsed.definitions}
    assert definitions[("schema", "schema")].docstring == "Root operations."
    assert definitions[("type", "Payment")].docstring == "Payment object."
    assert ("extend_type", "extend Payment") in definitions
    assert ("input", "PaymentInput") in definitions
    assert ("interface", "Node") in definitions
    assert ("enum", "PaymentState") in definitions
    assert ("union", "SearchResult") in definitions
    assert ("scalar", "DateTime") in definitions
    assert ("directive", "@upper") in definitions
    assert definitions[("query", "GetPayment")].docstring == "Fetch one payment."
    assert ("mutation", "CapturePayment") in definitions
    assert ("subscription", "PaymentCaptured") in definitions
    assert ("fragment", "PaymentFields") in definitions
