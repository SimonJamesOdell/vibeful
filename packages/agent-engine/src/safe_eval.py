"""Safe expression evaluator — evaluates math expressions without eval().

Uses Python's ast module to parse and evaluate mathematical expressions
safely. No code execution — only mathematical operations.
"""

from __future__ import annotations

import ast
import math
import operator

# Allowed operators and functions
_OPERATORS: dict[type, callable] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
    ast.Mod: operator.mod,
}

_FUNCTIONS: dict[str, callable] = {
    "abs": abs, "round": round, "min": min, "max": max,
    "sqrt": math.sqrt, "pi": lambda: math.pi, "e": lambda: math.e,
    "int": int, "float": float,
    "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "log": math.log, "log10": math.log10, "log2": math.log2,
    "ceil": math.ceil, "floor": math.floor,
}


class EvalError(Exception):
    """Raised when an expression cannot be safely evaluated."""
    pass


def safe_eval(expr: str) -> float | int:
    """Safely evaluate a mathematical expression.

    Args:
        expr: A mathematical expression string (e.g. '2 + 3 * 4', 'sqrt(16)').

    Returns:
        The numeric result.

    Raises:
        EvalError: If the expression contains disallowed operations.
    """
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError as e:
        raise EvalError(f"Invalid expression: {e}")

    return _eval_node(tree.body)


def _eval_node(node: ast.AST) -> float | int:
    """Recursively evaluate an AST node."""
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise EvalError(f"Unsupported constant: {type(node.value).__name__}")

    if isinstance(node, ast.BinOp):
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        op_type = type(node.op)
        if op_type not in _OPERATORS:
            raise EvalError(f"Unsupported operator: {op_type.__name__}")
        return _OPERATORS[op_type](left, right)

    if isinstance(node, ast.UnaryOp):
        operand = _eval_node(node.operand)
        op_type = type(node.op)
        if op_type not in _OPERATORS:
            raise EvalError(f"Unsupported unary operator: {op_type.__name__}")
        return _OPERATORS[op_type](operand)

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise EvalError("Only simple function calls are allowed")
        name = node.func.id
        if name not in _FUNCTIONS:
            raise EvalError(f"Unknown function: {name}")
        args = [_eval_node(a) for a in node.args]
        return _FUNCTIONS[name](*args)

    if isinstance(node, ast.Name):
        if node.id in _FUNCTIONS:
            result = _FUNCTIONS[node.id]()
            if callable(result):
                raise EvalError(f"'{node.id}' requires arguments")
            return result
        raise EvalError(f"Unknown name: {node.id}")

    raise EvalError(f"Unsupported expression type: {type(node).__name__}")
