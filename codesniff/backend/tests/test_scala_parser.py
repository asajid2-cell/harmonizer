from app.core.scala_parser import ScalaParser


def test_scala_parser_extracts_types_methods_top_level_functions_and_docs(tmp_path):
    source = tmp_path / "Payments.scala"
    source.write_text(
        "package billing\n"
        "\n"
        "/** Stores payment rows. */\n"
        "case class PaymentRecord(id: String, amount: BigDecimal)\n"
        "\n"
        "/** Reads payments. */\n"
        "trait PaymentRepository {\n"
        "  /** Load by id. */\n"
        "  def findById(id: String): Option[PaymentRecord]\n"
        "}\n"
        "\n"
        "/** Route builder. */\n"
        "object PaymentRoutes {\n"
        "  def routes(repo: PaymentRepository) = ???\n"
        "  private def normalize(id: String): String = id.trim\n"
        "}\n"
        "\n"
        "class PaymentService(repo: PaymentRepository) {\n"
        "  def capture(id: String): PaymentRecord = repo.findById(id).get\n"
        "}\n"
        "\n"
        "def topLevelHealth(): String = \"ok\"\n",
        encoding="utf-8",
    )

    parsed = ScalaParser().parse_file(str(source))

    assert parsed is not None
    functions = {function.name: function for function in parsed.functions}
    assert "topLevelHealth" in functions

    types = {scala_type.name: scala_type for scala_type in parsed.types}
    assert types["PaymentRecord"].kind == "class"
    assert types["PaymentRecord"].docstring == "Stores payment rows."
    assert types["PaymentRepository"].kind == "trait"
    assert types["PaymentRepository"].docstring == "Reads payments."
    assert types["PaymentRoutes"].kind == "object"
    assert types["PaymentRoutes"].docstring == "Route builder."
    assert types["PaymentService"].kind == "class"

    repository_methods = {method.name: method for method in types["PaymentRepository"].methods}
    assert repository_methods["findById"].docstring == "Load by id."
    route_methods = {method.name for method in types["PaymentRoutes"].methods}
    assert {"routes", "normalize"}.issubset(route_methods)
    service_methods = {method.name for method in types["PaymentService"].methods}
    assert "capture" in service_methods
