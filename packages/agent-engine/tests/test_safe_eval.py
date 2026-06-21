"""Tests for the safe expression evaluator.

Covers:
- All whitelisted operators: +, -, *, /, **, %, unary +, unary -
- All whitelisted functions: sqrt, sin, cos, tan, log, log10, log2,
  ceil, floor, abs, round, min, max, int, float, pi, e
- Nested and complex expressions
- Error cases: unknown functions, disallowed operations, syntax errors
- Security boundary: no attribute access, no code execution

Uses Python's ast module to safely evaluate — no eval() or exec().
"""

from __future__ import annotations

import math
import pytest
from src.safe_eval import safe_eval, EvalError


# ═══════════════════════════════════════════════════════════════
# Basic arithmetic operators
# ═══════════════════════════════════════════════════════════════

class TestBasicArithmetic:
    def test_addition(self):
        assert safe_eval("2 + 3") == 5
        assert safe_eval("10 + 20 + 30") == 60

    def test_subtraction(self):
        assert safe_eval("10 - 3") == 7
        assert safe_eval("5 - 10") == -5

    def test_multiplication(self):
        assert safe_eval("4 * 5") == 20
        assert safe_eval("2 * 3 * 4") == 24

    def test_division_float(self):
        result = safe_eval("10 / 4")
        assert result == 2.5

    def test_division_integer_result(self):
        result = safe_eval("10 / 2")
        assert result == 5.0

    def test_power(self):
        assert safe_eval("2 ** 3") == 8
        assert safe_eval("4 ** 0.5") == 2.0

    def test_modulo(self):
        assert safe_eval("10 % 3") == 1
        assert safe_eval("7 % 2") == 1


class TestUnaryOperators:
    def test_unary_negation(self):
        assert safe_eval("-5") == -5
        assert safe_eval("-(3 + 2)") == -5

    def test_unary_positive(self):
        assert safe_eval("+5") == 5
        assert safe_eval("+(10 - 3)") == 7

    def test_double_negation(self):
        assert safe_eval("--5") == 5
        assert safe_eval("---5") == -5


# ═══════════════════════════════════════════════════════════════
# Operator precedence
# ═══════════════════════════════════════════════════════════════

class TestOperatorPrecedence:
    def test_mult_before_add(self):
        assert safe_eval("2 + 3 * 4") == 14

    def test_power_before_mult(self):
        assert safe_eval("2 * 3 ** 2") == 18

    def test_parentheses_override(self):
        assert safe_eval("(2 + 3) * 4") == 20

    def test_nested_parentheses(self):
        assert safe_eval("((2 + 3) * (4 - 1)) / 5") == 3.0


# ═══════════════════════════════════════════════════════════════
# Math functions
# ═══════════════════════════════════════════════════════════════

class TestSqrtFunction:
    def test_sqrt_perfect_square(self):
        assert safe_eval("sqrt(16)") == 4.0
        assert safe_eval("sqrt(0)") == 0.0

    def test_sqrt_non_perfect(self):
        result = safe_eval("sqrt(2)")
        assert abs(result - math.sqrt(2)) < 1e-10


class TestTrigFunctions:
    def test_sin(self):
        result = safe_eval("sin(0)")
        assert abs(result) < 1e-10

    def test_cos(self):
        result = safe_eval("cos(0)")
        assert abs(result - 1.0) < 1e-10

    def test_tan(self):
        result = safe_eval("tan(0)")
        assert abs(result) < 1e-10

    def test_sin_of_pi_over_2(self):
        result = safe_eval("sin(pi() / 2)")
        assert abs(result - 1.0) < 1e-10


class TestLogFunctions:
    def test_log(self):
        result = safe_eval("log(e())")
        assert abs(result - 1.0) < 1e-10

    def test_log10(self):
        assert safe_eval("log10(100)") == 2.0
        assert safe_eval("log10(1)") == 0.0

    def test_log2(self):
        assert safe_eval("log2(8)") == 3.0
        assert safe_eval("log2(1)") == 0.0


class TestRoundingFunctions:
    def test_ceil(self):
        assert safe_eval("ceil(3.1)") == 4
        assert safe_eval("ceil(3.0)") == 3
        assert safe_eval("ceil(-2.3)") == -2

    def test_floor(self):
        assert safe_eval("floor(3.9)") == 3
        assert safe_eval("floor(3.0)") == 3
        assert safe_eval("floor(-2.3)") == -3

    def test_round_default(self):
        assert safe_eval("round(3.5)") == 4
        assert safe_eval("round(2.3)") == 2

    def test_round_with_ndigits(self):
        assert safe_eval("round(3.14159, 2)") == 3.14


class TestAggregateFunctions:
    def test_min(self):
        assert safe_eval("min(5, 3, 9)") == 3
        assert safe_eval("min(-1, 0, 1)") == -1

    def test_max(self):
        assert safe_eval("max(5, 3, 9)") == 9
        assert safe_eval("max(-1, 0, 1)") == 1

    def test_abs(self):
        assert safe_eval("abs(-5)") == 5
        assert safe_eval("abs(5)") == 5
        assert safe_eval("abs(0)") == 0


class TestTypeConversionFunctions:
    def test_int_conversion(self):
        assert safe_eval("int(3.9)") == 3
        assert safe_eval("int(-2.7)") == -2

    def test_float_conversion(self):
        assert safe_eval("float(5)") == 5.0
        assert safe_eval("float(-3)") == -3.0


class TestConstants:
    def test_pi(self):
        result = safe_eval("pi()")
        assert abs(result - math.pi) < 1e-10

    def test_e(self):
        result = safe_eval("e()")
        assert abs(result - math.e) < 1e-10


# ═══════════════════════════════════════════════════════════════
# Complex / nested expressions
# ═══════════════════════════════════════════════════════════════

class TestComplexExpressions:
    def test_nested_functions(self):
        result = safe_eval("sqrt(abs(-16))")
        assert result == 4.0

    def test_function_with_arithmetic_argument(self):
        result = safe_eval("sqrt(4 + 5)")
        assert result == 3.0

    def test_combined_operations(self):
        result = safe_eval("2 * sin(pi() / 6) + 1")
        assert abs(result - 2.0) < 1e-10

    def test_multi_argument_function(self):
        result = safe_eval("max(2 + 3, 4 * 2, sqrt(100))")
        assert result == 10.0

    def test_expression_with_spaces(self):
        assert safe_eval("  2  +  3  *  4  ") == 14

    def test_negative_number_in_expression(self):
        assert safe_eval("-5 + 10") == 5
        assert safe_eval("10 + -5") == 5


# ═══════════════════════════════════════════════════════════════
# Error cases — graceful failure, no crashes
# ═══════════════════════════════════════════════════════════════

class TestErrorCases:
    def test_unknown_function(self):
        with pytest.raises(EvalError, match="Unknown function"):
            safe_eval("foo(5)")

    def test_string_constant(self):
        with pytest.raises(EvalError, match="Unsupported constant"):
            safe_eval("'hello'")

    def test_empty_expression(self):
        with pytest.raises(EvalError):
            safe_eval("")

    def test_whitespace_only(self):
        with pytest.raises(EvalError):
            safe_eval("   ")

    def test_syntax_error(self):
        with pytest.raises(EvalError, match="Invalid expression"):
            safe_eval("2 +")

    def test_unbalanced_parens(self):
        with pytest.raises(EvalError):
            safe_eval("(2 + 3")

    def test_bitwise_operator_rejected(self):
        """Bitwise operators are not in the whitelist."""
        with pytest.raises(EvalError, match="Unsupported operator"):
            safe_eval("2 & 3")

    def test_function_without_args_where_required(self):
        """pi and e work without args, but sin requires an argument and raises TypeError."""
        with pytest.raises(TypeError):
            safe_eval("sin()")


# ═══════════════════════════════════════════════════════════════
# Security boundary — no code execution
# ═══════════════════════════════════════════════════════════════

class TestSecurityBoundary:
    """invariant: safe_eval must reject anything beyond pure math."""

    def test_no_attribute_access(self):
        with pytest.raises(EvalError):
            safe_eval("__import__('os').system('ls')")

    def test_no_builtin_access(self):
        with pytest.raises(EvalError):
            safe_eval("open('/etc/passwd')")

    def test_no_assignment(self):
        with pytest.raises(EvalError):
            safe_eval("x = 5")

    def test_no_comparison(self):
        with pytest.raises(EvalError):
            safe_eval("5 > 3")

    def test_no_boolean_ops(self):
        with pytest.raises(EvalError):
            safe_eval("True and False")

    def test_no_list_literals(self):
        with pytest.raises(EvalError):
            safe_eval("[1, 2, 3]")

    def test_no_lambda(self):
        with pytest.raises(EvalError):
            safe_eval("lambda x: x")

    def test_no_complex_number_suffix(self):
        with pytest.raises(EvalError):
            safe_eval("5j")

    def test_division_by_zero(self):
        """Division by zero should raise ZeroDivisionError, not a crash."""
        with pytest.raises((ZeroDivisionError, EvalError)):
            safe_eval("1 / 0")

    def test_negative_sqrt(self):
        """sqrt of negative should raise ValueError."""
        with pytest.raises(ValueError):
            safe_eval("sqrt(-1)")
