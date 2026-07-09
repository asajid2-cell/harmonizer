from app.core.lua_parser import LuaParser


def test_lua_parser_extracts_tables_functions_methods_and_docs(tmp_path):
    source = tmp_path / "payments.lua"
    source.write_text(
        "-- Build payment routes.\n"
        "local function buildRoutes(app)\n"
        "  return app\n"
        "end\n"
        "\n"
        "--- Payment service table.\n"
        "local PaymentService = {}\n"
        "\n"
        "--- Capture one payment.\n"
        "function PaymentService.capture(id, amount)\n"
        "  return id .. amount\n"
        "end\n"
        "\n"
        "function PaymentService:refund(id)\n"
        "  return id\n"
        "end\n"
        "\n"
        "local function normalize_id(id)\n"
        "  return id:gsub(\"%s\", \"\")\n"
        "end\n",
        encoding="utf-8",
    )

    parsed = LuaParser().parse_file(str(source))

    assert parsed is not None
    functions = {function.name: function for function in parsed.functions}
    assert {"buildRoutes", "normalize_id"}.issubset(functions)
    assert functions["buildRoutes"].docstring == "Build payment routes."

    tables = {table.name: table for table in parsed.tables}
    assert tables["PaymentService"].docstring == "Payment service table."
    methods = {method.name: method for method in tables["PaymentService"].methods}
    assert {"capture", "refund"}.issubset(methods)
    assert methods["capture"].docstring == "Capture one payment."
