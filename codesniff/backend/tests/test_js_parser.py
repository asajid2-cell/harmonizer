from app.core.js_parser import JSParser


def test_js_parser_uses_tree_sitter_for_exported_symbols_and_methods(tmp_path):
    source = tmp_path / "widgets.js"
    source.write_text(
        "/** Load one user. */\n"
        "export async function loadUser(id) { return id }\n"
        "/** Save one user. */\n"
        "export const saveUser = async (user) => ({ ...user })\n"
        "const compact = function(value) { return value }\n"
        "/** User card component. */\n"
        "export class UserCard extends Base {\n"
        "  /** Render the card. */\n"
        "  render() { return null }\n"
        "  async load() { return saveUser({}) }\n"
        "}\n",
        encoding="utf-8",
    )

    parsed = JSParser().parse_file(str(source))

    assert parsed is not None
    assert parsed.parse_errors == []
    functions = {function.name: function for function in parsed.functions}
    assert {"loadUser", "saveUser", "compact"}.issubset(functions)
    assert functions["loadUser"].docstring == "Load one user."
    assert functions["saveUser"].docstring == "Save one user."

    classes = {cls.name: cls for cls in parsed.classes}
    assert set(classes) == {"UserCard"}
    assert classes["UserCard"].docstring == "User card component."
    methods = {method.name: method for method in classes["UserCard"].methods}
    assert {"render", "load"}.issubset(methods)
    assert methods["render"].docstring == "Render the card."


def test_js_parser_uses_tsx_grammar_for_typed_react_symbols(tmp_path):
    source = tmp_path / "AnimatedButton.tsx"
    source.write_text(
        "import React from 'react';\n"
        "\n"
        "/** Button with animation effects. */\n"
        "export const AnimatedButton: React.FC = ({ onClick, children }) => {\n"
        "  const handleClick = () => {\n"
        "    onClick();\n"
        "  };\n"
        "  return <button onClick={handleClick}>{children}</button>;\n"
        "};\n"
        "\n"
        "/** Spinner loading animation. */\n"
        "export function LoadingSpinner(): JSX.Element {\n"
        "  return <div className=\"spinner animate-spin\" />;\n"
        "}\n",
        encoding="utf-8",
    )

    parsed = JSParser().parse_file(str(source))

    assert parsed is not None
    assert parsed.parse_errors == []
    functions = {function.name: function for function in parsed.functions}
    assert {"AnimatedButton", "LoadingSpinner", "handleClick"}.issubset(functions)
    assert functions["AnimatedButton"].docstring == "Button with animation effects."
    assert functions["LoadingSpinner"].docstring == "Spinner loading animation."


def test_js_parser_uses_typescript_grammar_for_type_symbols(tmp_path):
    source = tmp_path / "accounts.ts"
    source.write_text(
        "/** Public account contract. */\n"
        "export interface AccountContract { id: string }\n"
        "/** Account loader function type. */\n"
        "export type AccountLoader<T> = (id: string) => Promise<T>\n"
        "/** Load an account by id. */\n"
        "export async function loadAccount(id: string): Promise<AccountContract> {\n"
        "  return { id };\n"
        "}\n"
        "export const saveAccount = async (account: AccountContract): Promise<AccountContract> => ({ ...account })\n"
        "export class AccountPresenter {\n"
        "  render(): string { return 'account'; }\n"
        "}\n",
        encoding="utf-8",
    )

    parsed = JSParser().parse_file(str(source))

    assert parsed is not None
    assert parsed.parse_errors == []
    functions = {function.name: function for function in parsed.functions}
    assert {"loadAccount", "saveAccount"}.issubset(functions)
    assert functions["loadAccount"].docstring == "Load an account by id."

    classes = {cls.name: cls for cls in parsed.classes}
    assert {"AccountContract", "AccountLoader", "AccountPresenter"}.issubset(classes)
    assert classes["AccountContract"].docstring == "Public account contract."
    assert classes["AccountLoader"].docstring == "Account loader function type."
    methods = {method.name for method in classes["AccountPresenter"].methods}
    assert "render" in methods
