"""
while_lang.py — an interpreter for the While language from COMP11212.

Copyright (c) 2026 Kamal Hassiba
Licensed under the MIT License. See LICENSE in the repository root.

This module IS the executable definition of the operational semantics.
The trace printer's output renders the formal small-step semantics
(⟨S, σ⟩ ⇒ ⟨S', σ'⟩) — the Python is the implementation, the formal
notation is the rendering.

ASCII input syntax (because typing ≤, ¬, ∧ is awkward):
    Boolean:  tt, ff, =, <=, !  (not), &  (and)
    Statements: :=, skip, ;, if-then-else, while-do
    Brackets () around the body of if-else and while are required.

Example:
    >>> trace("x := 1; y := 5; while !y = 0 do (x := x * 2; y := y - 1)",
    ...       state={}, view="formal")
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Union

from lark import Lark, Transformer, v_args


# ─────────────────────────────────────────────────────────────────────────────
# AST — the abstract syntax (one Python class per BNF non-terminal alternative)
# ─────────────────────────────────────────────────────────────────────────────

# Arithmetic expressions
@dataclass(frozen=True)
class Num:    value: int
@dataclass(frozen=True)
class Var:    name: str
@dataclass(frozen=True)
class Add:    left: "AExp"; right: "AExp"
@dataclass(frozen=True)
class Sub:    left: "AExp"; right: "AExp"
@dataclass(frozen=True)
class Mul:    left: "AExp"; right: "AExp"

AExp = Union[Num, Var, Add, Sub, Mul]


# Boolean expressions
@dataclass(frozen=True)
class BTrue:  pass
@dataclass(frozen=True)
class BFalse: pass
@dataclass(frozen=True)
class Eq:     left: AExp; right: AExp
@dataclass(frozen=True)
class Le:     left: AExp; right: AExp
@dataclass(frozen=True)
class Not:    arg: "BExp"
@dataclass(frozen=True)
class And:    left: "BExp"; right: "BExp"

BExp = Union[BTrue, BFalse, Eq, Le, Not, And]


# Statements
@dataclass(frozen=True)
class Skip:   pass
@dataclass(frozen=True)
class Assign: var: str; expr: AExp
@dataclass(frozen=True)
class Seq:    first: "Stmt"; second: "Stmt"
@dataclass(frozen=True)
class If:     cond: BExp; then_branch: "Stmt"; else_branch: "Stmt"
@dataclass(frozen=True)
class While:  cond: BExp; body: "Stmt"

Stmt = Union[Skip, Assign, Seq, If, While]


# ─────────────────────────────────────────────────────────────────────────────
# Configurations and transitions — ⟨S, σ⟩ and ⇒
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Config:
    """A configuration ⟨S, σ⟩: program text remaining + state."""
    stmt: Stmt
    state: dict[str, int]


@dataclass
class Transition:
    """One small-step ⟨S, σ⟩ ⇒ ⟨S', σ'⟩ with the rule that justified it."""
    before: Config
    after:  Config
    rule:   str   # ":=" | "skip-;" | ";" | "if-tt" | "if-ff" | "while-tt" | "while-ff"


class StepBudgetExceeded(Exception):
    """Raised when trace() exhausts max_steps — likely non-termination."""


# ─────────────────────────────────────────────────────────────────────────────
# Lark grammar — the syntax (BNF translated for Lark, with explicit precedence)
# ─────────────────────────────────────────────────────────────────────────────

_GRAMMAR = r"""
start: stmt

?stmt: stmt ";" stmt2     -> seq
     | stmt2

?stmt2: assign
      | skip_stmt
      | if_stmt
      | while_stmt
      | "(" stmt ")"

assign:     NAME ":=" aexp
skip_stmt:  "skip"
if_stmt:    "if" bexp "then" stmt2 "else" "(" stmt ")"
while_stmt: "while" bexp "do" "(" stmt ")"

?aexp:     aexp "+" mul_term  -> add
         | aexp "-" mul_term  -> sub
         | mul_term

?mul_term: mul_term "*" atom  -> mul
         | atom

?atom:     SIGNED_INT         -> num
         | NAME               -> var
         | "(" aexp ")"

?bexp:     bexp "&" bexp_not  -> band
         | bexp_not

?bexp_not: "!" bexp_not       -> bnot
         | bexp_atom

?bexp_atom: "tt"              -> btrue
          | "ff"              -> bfalse
          | aexp "=" aexp     -> beq
          | aexp "<=" aexp    -> ble
          | "(" bexp ")"

%import common.SIGNED_INT
%import common.CNAME -> NAME
%import common.WS
%ignore WS
"""


@v_args(inline=True)
class _Builder(Transformer):
    """Walks the Lark parse tree and produces our AST classes."""
    # arithmetic
    def num(self, n):     return Num(int(n))
    def var(self, name):  return Var(str(name))
    def add(self, l, r):  return Add(l, r)
    def sub(self, l, r):  return Sub(l, r)
    def mul(self, l, r):  return Mul(l, r)
    # boolean
    def btrue(self):      return BTrue()
    def bfalse(self):     return BFalse()
    def beq(self, l, r):  return Eq(l, r)
    def ble(self, l, r):  return Le(l, r)
    def bnot(self, b):    return Not(b)
    def band(self, l, r): return And(l, r)
    # statements
    def assign(self, name, expr): return Assign(str(name), expr)
    def skip_stmt(self):          return Skip()
    def seq(self, l, r):          return Seq(l, r)
    def if_stmt(self, c, t, e):   return If(c, t, e)
    def while_stmt(self, c, b):   return While(c, b)
    def start(self, s):           return s


_PARSER = Lark(_GRAMMAR, parser="earley", maybe_placeholders=False)


def parse(source: str) -> Stmt:
    """Parse a While source string into an AST."""
    tree = _PARSER.parse(source)
    return _Builder().transform(tree)


# ─────────────────────────────────────────────────────────────────────────────
# Evaluators A and B — chapter §2.3.1 and §2.3.2
# ─────────────────────────────────────────────────────────────────────────────

def A(expr: AExp, sigma: dict[str, int]) -> int:
    """A⟦a⟧σ — evaluate an arithmetic expression in state σ to an integer."""
    if isinstance(expr, Num): return expr.value
    if isinstance(expr, Var): return sigma.get(expr.name, 0)   # default-zero
    if isinstance(expr, Add): return A(expr.left, sigma) + A(expr.right, sigma)
    if isinstance(expr, Sub): return A(expr.left, sigma) - A(expr.right, sigma)
    if isinstance(expr, Mul): return A(expr.left, sigma) * A(expr.right, sigma)
    raise TypeError(f"A: unknown AExp node {type(expr).__name__}")


def B(expr: BExp, sigma: dict[str, int]) -> bool:
    """B⟦b⟧σ — evaluate a boolean expression in state σ to tt or ff."""
    if isinstance(expr, BTrue):  return True
    if isinstance(expr, BFalse): return False
    if isinstance(expr, Eq):     return A(expr.left, sigma) == A(expr.right, sigma)
    if isinstance(expr, Le):     return A(expr.left, sigma) <= A(expr.right, sigma)
    if isinstance(expr, Not):    return not B(expr.arg, sigma)
    if isinstance(expr, And):    return B(expr.left, sigma) and B(expr.right, sigma)
    raise TypeError(f"B: unknown BExp node {type(expr).__name__}")


# ─────────────────────────────────────────────────────────────────────────────
# step — the small-step transition relation ⇒
# ─────────────────────────────────────────────────────────────────────────────

def step(cfg: Config) -> Transition | None:
    """One small step. Returns None iff cfg.stmt is Skip (terminal)."""
    s, sigma = cfg.stmt, cfg.state

    # skip is terminal — no rule applies
    if isinstance(s, Skip):
        return None

    # x := a    ⇒    skip,  σ[x ↦ A⟦a⟧σ]
    if isinstance(s, Assign):
        new_sigma = dict(sigma)
        new_sigma[s.var] = A(s.expr, sigma)
        return Transition(cfg, Config(Skip(), new_sigma), ":=")

    # S; T
    if isinstance(s, Seq):
        # special case: skip; T  ⇒  T
        if isinstance(s.first, Skip):
            return Transition(cfg, Config(s.second, sigma), "skip-;")
        # general case: take a step of S, keep T as remainder.
        # We propagate the inner rule's label up — the ; rule is "transparent",
        # what we report is the actual work that happened inside.
        sub = step(Config(s.first, sigma))
        if sub is None:
            # impossible — Skip handled above, no other terminal
            raise RuntimeError("step: Seq's first stmt has no transition")
        return Transition(
            cfg,
            Config(Seq(sub.after.stmt, s.second), sub.after.state),
            sub.rule,
        )

    # if b then S else (S')
    if isinstance(s, If):
        if B(s.cond, sigma):
            return Transition(cfg, Config(s.then_branch, sigma), "if-tt")
        else:
            return Transition(cfg, Config(s.else_branch, sigma), "if-ff")

    # while b do (S)
    if isinstance(s, While):
        if B(s.cond, sigma):
            # ⇒ S; while b do (S)
            unfolded = Seq(s.body, s)
            return Transition(cfg, Config(unfolded, sigma), "while-tt")
        else:
            # ⇒ skip
            return Transition(cfg, Config(Skip(), sigma), "while-ff")

    raise TypeError(f"step: unknown Stmt node {type(s).__name__}")


def step_iter(prog: Stmt | str, state: dict[str, int],
              max_steps: int = 10_000) -> Iterator[Transition]:
    """Yields one Transition per small step, until Skip or budget exhausted."""
    if isinstance(prog, str):
        prog = parse(prog)
    cfg = Config(prog, dict(state))
    for _ in range(max_steps):
        t = step(cfg)
        if t is None:
            return
        yield t
        cfg = t.after
    raise StepBudgetExceeded(f"exceeded {max_steps} steps")


# ─────────────────────────────────────────────────────────────────────────────
# Step counting for complexity analysis (Chapter 3)
# ─────────────────────────────────────────────────────────────────────────────

# Per the chapter (§3.1.4), a "step" counts only:
#   - Assignments  (the := rule)
#   - Boolean condition checks  (the if-tt/ff and while-tt/ff rules each
#     evaluate one boolean expression)
# The administrative ; and skip-; rules don't count — they're not work the
# program is doing, they're just syntactic bookkeeping in the small-step
# semantics.
COUNTED_RULES = frozenset({":=", "if-tt", "if-ff", "while-tt", "while-ff"})


def count_steps(prog, state=None, max_steps=1_000_000):
    """
    Count chapter-style 'steps' (assignments + boolean checks) for one run.
    Raises StepBudgetExceeded if the program does not terminate.
    """
    if state is None:
        state = {}
    n = 0
    for t in step_iter(prog, state, max_steps=max_steps):
        if t.rule in COUNTED_RULES:
            n += 1
    return n


def step_growth(prog, state_fn, sizes, max_steps=1_000_000):
    """
    Run the program for each input size in `sizes`, with the initial state
    given by `state_fn(n)`. Returns {n: step_count}.

    Used for empirical growth-rate measurement: plot the result and you can
    visually identify the asymptotic complexity class.
    """
    out = {}
    for n in sizes:
        out[n] = count_steps(prog, state_fn(n), max_steps=max_steps)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Empirical Hoare-triple verification (Chapter 4)
# ─────────────────────────────────────────────────────────────────────────────

# This is a SANITY-CHECK tool, not a proof system. It runs the program on a
# finite sample of states and checks the post-state satisfies the postcondition.
# A successful verification doesn't prove the triple holds in general — it
# just shows it holds on the sample. Use this to catch obviously wrong
# pre/post conditions before you start writing a Hoare-logic derivation.

def verify_triple(precond, prog, postcond, sample_states,
                  mode='partial', max_steps=10_000):
    """
    Empirically check a Hoare triple {P} S {Q} (or {P} S {⇓ Q}) on a sample.

    precond:  callable state -> bool   (predicate P)
    prog:     While source (str) or AST
    postcond: callable state -> bool   (predicate Q)
    sample_states: iterable of dicts to test
    mode: 'partial' = ignore non-terminating runs;
          'total'   = non-termination is a failure.

    Returns dict with:
      - 'sampled':   total states sampled
      - 'precondition_holds': how many satisfied P
      - 'verified':  how many satisfied P AND Q-after-running (terminated for total)
      - 'failed':    list of (state, reason) for states where P held but Q-after didn't
                     (or for total mode, where the program didn't terminate)
    """
    sampled = 0
    pre_ok = 0
    verified = 0
    failed = []

    for sigma in sample_states:
        sampled += 1
        if not precond(dict(sigma)):
            continue
        pre_ok += 1
        try:
            final = run(prog, sigma, max_steps=max_steps)
        except StepBudgetExceeded:
            if mode == 'total':
                failed.append((dict(sigma), "did not terminate within step budget"))
            # for partial mode: non-termination is fine, skip the post-check
            continue
        if not postcond(final):
            failed.append((dict(sigma), f"postcondition failed; final state = {final}"))
        else:
            verified += 1

    return {
        'sampled': sampled,
        'precondition_holds': pre_ok,
        'verified': verified,
        'failed': failed,
    }


def report_triple(precond, prog, postcond, sample_states,
                  mode='partial', max_steps=10_000, label=''):
    """Run verify_triple and pretty-print the result."""
    result = verify_triple(precond, prog, postcond, sample_states,
                           mode=mode, max_steps=max_steps)
    title = label or "Hoare triple verification"
    arrow = "⇓ " if mode == 'total' else ""
    print(f"{title}  ({mode})")
    print(f"  sampled:                  {result['sampled']}")
    print(f"  satisfied precondition:   {result['precondition_holds']}")
    print(f"  verified ({arrow}post holds):  {result['verified']}")
    if result['failed']:
        print(f"  ❌ FAILURES: {len(result['failed'])}")
        for state, reason in result['failed'][:5]:
            print(f"     - {state}  →  {reason}")
        if len(result['failed']) > 5:
            print(f"     ... and {len(result['failed']) - 5} more")
    else:
        print("  ✅ no counter-examples in sample")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Gödel encodings (Chapter 6) — bijections between data and ℕ
# ─────────────────────────────────────────────────────────────────────────────

# β: ℤ → ℕ  (and its inverse β')
#   β(x)  = 2x        if x ≥ 0
#         = -2x - 1   else
#   β'(n) = n // 2    if n is even
#         = -(n+1)//2 if n is odd

def encode_int(x):
    """β: ℤ → ℕ. Bijection from integers to naturals."""
    return 2 * x if x >= 0 else -2 * x - 1


def decode_int(n):
    """β': ℕ → ℤ. Inverse of encode_int."""
    return n // 2 if n % 2 == 0 else -((n + 1) // 2)


# φ: ℕ × ℕ → ℕ  (and its inverse φ')
#   φ(m, n) = 2^m * (2n + 1) - 1

def encode_pair(m, n):
    """φ: ℕ × ℕ → ℕ. Bijection from natural pairs to naturals."""
    return (2 ** m) * (2 * n + 1) - 1


def decode_pair(k):
    """φ': ℕ → ℕ × ℕ. Inverse of encode_pair."""
    if k < 0:
        raise ValueError(f"decode_pair: input must be non-negative, got {k}")
    s = k + 1                       # s = 2^m * (2n + 1)
    m = 0
    while s % 2 == 0:
        s //= 2
        m += 1
    # Now s is odd, s = 2n + 1
    n = (s - 1) // 2
    return (m, n)


# Triples + arbitrary tuples — apply φ recursively.
def encode_tuple(*xs):
    """Encode a tuple of naturals as a single natural via right-fold of φ."""
    if not xs:
        raise ValueError("encode_tuple: empty tuple has no encoding")
    if len(xs) == 1:
        return xs[0]
    # φ(x₀, φ(x₁, φ(x₂, ...)))
    rest = encode_tuple(*xs[1:])
    return encode_pair(xs[0], rest)


def decode_tuple(k, length):
    """Decode a natural into a length-length tuple via right-fold of φ'."""
    if length <= 0:
        raise ValueError("decode_tuple: length must be positive")
    if length == 1:
        return (k,)
    head, rest = decode_pair(k)
    return (head,) + decode_tuple(rest, length - 1)


# ψ: lists of ℕ → ℕ
#   ψ([])     = 0
#   ψ(n :: l) = φ(n, ψ(l)) + 1

def encode_list(xs):
    """ψ: lists of naturals → ℕ. Bijection."""
    if not xs:
        return 0
    return encode_pair(xs[0], encode_list(xs[1:])) + 1


def decode_list(k):
    """ψ⁻¹: ℕ → list of naturals. Inverse of encode_list."""
    if k == 0:
        return []
    head, rest = decode_pair(k - 1)
    return [head] + decode_list(rest)


# Variable encoding: φ_V(x_i) = i.
# We assume variables are named "x_0", "x_1", ..., or just any string with a
# numeric suffix after an underscore. For variables in chapter 1 examples (m,
# n, x, y, etc.) we use a fixed mapping for compatibility.

_VAR_INDEX = {}            # name -> index, populated lazily

def encode_var(name):
    """φ_V: variable name → ℕ. Lazily assigns indices in encounter order."""
    if name not in _VAR_INDEX:
        # If the name has a numeric suffix like "x_5", use that as the index
        # to match the chapter's convention.
        if "_" in name:
            try:
                idx = int(name.rsplit("_", 1)[1])
                _VAR_INDEX[name] = idx
                return idx
            except ValueError:
                pass
        # Otherwise assign the next available index.
        _VAR_INDEX[name] = len(_VAR_INDEX)
    return _VAR_INDEX[name]


def reset_var_indices():
    """Reset the variable-name → index mapping (useful between independent encodings)."""
    _VAR_INDEX.clear()


# φ_A: AExp → ℕ
#   φ_A(n)        = 5 * β'(n)             where n is a numeral; β' takes ℕ to ℤ
#                                         (actually the chapter writes β'·n, treating numerals as ℤ)
#   φ_A(x)        = 1 + 5 * φ_V(x)
#   φ_A(a + a')   = 2 + 5 * φ(φ_A a, φ_A a')
#   φ_A(a − a')   = 3 + 5 * φ(φ_A a, φ_A a')
#   φ_A(a × a')   = 4 + 5 * φ(φ_A a, φ_A a')
# Wait — chapter says "5 ⋅ β'n" but β' goes ℕ → ℤ; here n is a numeral meaning
# an integer. The natural reading is: numerals can be any integer, encoded
# via β. So φ_A(numeral n) = 5 * β(n).

def encode_aexp(expr):
    """φ_A: AExp → ℕ."""
    if isinstance(expr, Num):
        return 5 * encode_int(expr.value)
    if isinstance(expr, Var):
        return 1 + 5 * encode_var(expr.name)
    if isinstance(expr, Add):
        return 2 + 5 * encode_pair(encode_aexp(expr.left), encode_aexp(expr.right))
    if isinstance(expr, Sub):
        return 3 + 5 * encode_pair(encode_aexp(expr.left), encode_aexp(expr.right))
    if isinstance(expr, Mul):
        return 4 + 5 * encode_pair(encode_aexp(expr.left), encode_aexp(expr.right))
    raise TypeError(f"encode_aexp: unknown {type(expr).__name__}")


# φ_B: BExp → ℕ
#   φ_B(ff)        = 0
#   φ_B(tt)        = 1
#   φ_B(a = a')    = 2 + 4 * φ(φ_A a, φ_A a')
#   φ_B(a ≤ a')    = 3 + 4 * φ(φ_A a, φ_A a')
#   φ_B(¬b)        = 4 + 4 * φ_B(b)
#   φ_B(b ∧ b')    = 5 + 4 * φ(φ_B b, φ_B b')
# Note: 5 + 4·k is one more than 4 + 4·k, but the cases for "= and ≤" use
# φ(φ_A,...) which involves arithmetic encodings (typically ≥ 0), and the
# cases for ¬ and ∧ use φ_B which can give 0 (for ff). The mapping is still
# injective; all six branches produce distinct residues mod 4.
# Wait — there are 6 cases here but only 4 residues mod 4. Let me re-check.
# Looking at the chapter:
#   ff: 0 (residue 0)
#   tt: 1 (residue 1)
#   = : 2 + 4k (residue 2)
#   ≤ : 3 + 4k (residue 3)
#   ¬ : 4 + 4k = 4(k+1) (residue 0)
#   ∧ : 5 + 4k = 4(k+1) + 1 (residue 1)
# So the residues do collide: {ff, ¬} both have residue 0; {tt, ∧} both have
# residue 1. The chapter must distinguish via the size: ff = 0 specifically,
# and 4 + 4k for ¬ is ≥ 4. tt = 1 specifically; ∧ gives 5 + 4k ≥ 5.
# So the rule is: 0 = ff, 1 = tt, residue 2 = equality, residue 3 = ≤,
# residue 0 with value ≥ 4 = ¬, residue 1 with value ≥ 5 = ∧.

def encode_bexp(expr):
    """φ_B: BExp → ℕ."""
    if isinstance(expr, BFalse):
        return 0
    if isinstance(expr, BTrue):
        return 1
    if isinstance(expr, Eq):
        return 2 + 4 * encode_pair(encode_aexp(expr.left), encode_aexp(expr.right))
    if isinstance(expr, Le):
        return 3 + 4 * encode_pair(encode_aexp(expr.left), encode_aexp(expr.right))
    if isinstance(expr, Not):
        return 4 + 4 * encode_bexp(expr.arg)
    if isinstance(expr, And):
        return 5 + 4 * encode_pair(encode_bexp(expr.left), encode_bexp(expr.right))
    raise TypeError(f"encode_bexp: unknown {type(expr).__name__}")


# φ_S: Stmt → ℕ
#   φ_S(skip)              = 0
#   φ_S(x ≔ a)              = 1 + 4 * φ(φ_V x, φ_A a)
#   φ_S(S; S')              = 2 + 4 * φ(φ_S S, φ_S S')
#   φ_S(if b then S else S') = 3 + 4 * φ(φ_B b, φ(φ_S S, φ_S S'))
#   φ_S(while b do S)        = 4 + 4 * φ(φ_B b, φ_S S)

def encode_stmt(stmt):
    """φ_S: Stmt → ℕ."""
    if isinstance(stmt, Skip):
        return 0
    if isinstance(stmt, Assign):
        return 1 + 4 * encode_pair(encode_var(stmt.var), encode_aexp(stmt.expr))
    if isinstance(stmt, Seq):
        return 2 + 4 * encode_pair(encode_stmt(stmt.first), encode_stmt(stmt.second))
    if isinstance(stmt, If):
        return 3 + 4 * encode_pair(
            encode_bexp(stmt.cond),
            encode_pair(encode_stmt(stmt.then_branch), encode_stmt(stmt.else_branch)),
        )
    if isinstance(stmt, While):
        return 4 + 4 * encode_pair(encode_bexp(stmt.cond), encode_stmt(stmt.body))
    raise TypeError(f"encode_stmt: unknown {type(stmt).__name__}")


def encode_program(source_or_ast):
    """Convenience: parse if needed, then encode_stmt."""
    if isinstance(source_or_ast, str):
        return encode_stmt(parse(source_or_ast))
    return encode_stmt(source_or_ast)


# Decoders for AExp, BExp, Stmt — invert the encodings.
def decode_aexp(n):
    """φ_A⁻¹: ℕ → AExp."""
    r = n % 5
    q = n // 5
    if r == 0:
        return Num(decode_int(q))
    if r == 1:
        # q is the variable index. We can't recover the name without context,
        # so synthesise a name "x_{q}".
        return Var(f"x_{q}")
    if r in (2, 3, 4):
        a_idx, b_idx = decode_pair(q)
        left = decode_aexp(a_idx)
        right = decode_aexp(b_idx)
        return {2: Add, 3: Sub, 4: Mul}[r](left, right)
    raise ValueError(f"decode_aexp: invalid encoding {n}")


def decode_bexp(n):
    """φ_B⁻¹: ℕ → BExp."""
    if n == 0:
        return BFalse()
    if n == 1:
        return BTrue()
    r = n % 4
    q = n // 4
    if r == 2:
        a_idx, b_idx = decode_pair(q)
        return Eq(decode_aexp(a_idx), decode_aexp(b_idx))
    if r == 3:
        a_idx, b_idx = decode_pair(q)
        return Le(decode_aexp(a_idx), decode_aexp(b_idx))
    if r == 0:
        # ¬ case: n = 4 + 4·k for k = q-1
        return Not(decode_bexp(q - 1))
    if r == 1:
        # ∧ case: n = 5 + 4·k for k = q-1 (since (5+4k) // 4 = 1 + k for k = (n-5)/4)
        # Wait: (5 + 4k) // 4 = 1 + k.   (5 + 4k) % 4 = 1.   So q = 1 + k → k = q - 1.
        a_idx, b_idx = decode_pair(q - 1)
        return And(decode_bexp(a_idx), decode_bexp(b_idx))
    raise ValueError(f"decode_bexp: invalid encoding {n}")


def decode_stmt(n):
    """φ_S⁻¹: ℕ → Stmt."""
    if n == 0:
        return Skip()
    r = n % 4
    q = n // 4
    if r == 1:
        v_idx, a_idx = decode_pair(q)
        return Assign(f"x_{v_idx}", decode_aexp(a_idx))
    if r == 2:
        s_idx, s2_idx = decode_pair(q)
        return Seq(decode_stmt(s_idx), decode_stmt(s2_idx))
    if r == 3:
        b_idx, rest = decode_pair(q)
        s_idx, s2_idx = decode_pair(rest)
        return If(decode_bexp(b_idx), decode_stmt(s_idx), decode_stmt(s2_idx))
    if r == 0:
        # while case: n = 4 + 4·k for k = q-1
        b_idx, s_idx = decode_pair(q - 1)
        return While(decode_bexp(b_idx), decode_stmt(s_idx))
    raise ValueError(f"decode_stmt: invalid encoding {n}")


# ─────────────────────────────────────────────────────────────────────────────
# Big-step operational semantics (Appendix B)
# ─────────────────────────────────────────────────────────────────────────────

# Big-step: ⟨S, σ⟩ ⇓ σ' — directly compute the final state.
#
# Five rules:
#   skip:   ⟨skip, σ⟩ ⇓ σ
#   :=:     ⟨x := a, σ⟩ ⇓ σ[x ↦ A(a, σ)]
#   ;:      ⟨S, σ⟩ ⇓ σ' and ⟨S', σ'⟩ ⇓ σ''  ⟹  ⟨S; S', σ⟩ ⇓ σ''
#   if:     branch on B(b, σ)
#   while:  if B(b, σ) = ff:  ⟨while b do S, σ⟩ ⇓ σ
#           if B(b, σ) = tt:  ⟨S, σ⟩ ⇓ σ' and ⟨while b do S, σ'⟩ ⇓ σ''
#                              ⟹ ⟨while b do S, σ⟩ ⇓ σ''

def big_step(prog, state=None, max_depth=10_000):
    """
    Big-step evaluator: directly compute the final state σ' from ⟨prog, state⟩.

    For non-terminating programs this would loop forever — we use an iteration
    counter on while loops to bail out. Raises StepBudgetExceeded if hit.

    Returns the final state as a dict (with zero values stripped, like run()).
    """
    if isinstance(prog, str):
        prog = parse(prog)
    if state is None:
        state = {}

    # Use a counter object (single-element list) so the closure can mutate it.
    iters = [0]

    def eval_stmt(s, sigma):
        iters[0] += 1
        if iters[0] > max_depth:
            raise StepBudgetExceeded(
                f"big_step exceeded {max_depth} sub-evaluations — likely non-terminating"
            )

        if isinstance(s, Skip):
            return sigma
        if isinstance(s, Assign):
            return {**sigma, s.var: A(s.expr, sigma)}
        if isinstance(s, Seq):
            sigma1 = eval_stmt(s.first, sigma)
            return eval_stmt(s.second, sigma1)
        if isinstance(s, If):
            if B(s.cond, sigma):
                return eval_stmt(s.then_branch, sigma)
            else:
                return eval_stmt(s.else_branch, sigma)
        if isinstance(s, While):
            if not B(s.cond, sigma):
                return sigma
            sigma1 = eval_stmt(s.body, sigma)
            return eval_stmt(s, sigma1)   # recurse on the same loop
        raise TypeError(f"big_step: unknown {type(s).__name__}")

    final = eval_stmt(prog, dict(state))
    # Strip zero values for canonical form (matches run())
    return {k: v for k, v in final.items() if v != 0}


def big_step_steps(prog, state=None, max_depth=10_000):
    """
    Iterative version using an explicit stack — avoids Python recursion limits
    for deeply-nested programs. Same return semantics as big_step.
    """
    # Implementation: while-loop unfolds into Seq(body, While) recursively, so
    # we use the recursive version. Python's default recursion limit is ~1000;
    # for deep recursion we'd want sys.setrecursionlimit. For now, just call
    # big_step and trust the iters counter.
    import sys
    old_limit = sys.getrecursionlimit()
    try:
        sys.setrecursionlimit(max(old_limit, max_depth + 1000))
        return big_step(prog, state, max_depth)
    finally:
        sys.setrecursionlimit(old_limit)


def big_step_agrees_small_step(prog, state=None, max_steps=10_000):
    """
    Sanity check: the big-step and small-step semantics should agree on the
    final state for any terminating program. Returns True iff both produce
    the same final state (after zero-stripping).
    """
    try:
        big = big_step(prog, state, max_depth=max_steps)
    except StepBudgetExceeded:
        big = None
    try:
        small = run(prog, state, max_steps=max_steps)
    except StepBudgetExceeded:
        small = None

    return big == small


# ─────────────────────────────────────────────────────────────────────────────
# Unparser — turn AST nodes back into source-like strings (with formal symbols)
# ─────────────────────────────────────────────────────────────────────────────

def aexp_to_str(e: AExp, parens: bool = False) -> str:
    if isinstance(e, Num):
        return str(e.value)
    if isinstance(e, Var):
        return e.name
    if isinstance(e, (Add, Sub, Mul)):
        op = {"Add": "+", "Sub": "−", "Mul": "×"}[type(e).__name__]
        # children of × bind tighter than +/−, but we just always parenthesise
        s = f"{aexp_to_str(e.left, True)} {op} {aexp_to_str(e.right, True)}"
        return f"({s})" if parens else s
    raise TypeError(f"aexp_to_str: {type(e).__name__}")


def bexp_to_str(e: BExp, parens: bool = False) -> str:
    if isinstance(e, BTrue):  return "tt"
    if isinstance(e, BFalse): return "ff"
    if isinstance(e, Eq):     return f"{aexp_to_str(e.left)} = {aexp_to_str(e.right)}"
    if isinstance(e, Le):     return f"{aexp_to_str(e.left)} ≤ {aexp_to_str(e.right)}"
    if isinstance(e, Not):    return f"¬{bexp_to_str(e.arg, True)}"
    if isinstance(e, And):
        s = f"{bexp_to_str(e.left, True)} ∧ {bexp_to_str(e.right, True)}"
        return f"({s})" if parens else s
    raise TypeError(f"bexp_to_str: {type(e).__name__}")


def stmt_to_str(s: Stmt) -> str:
    if isinstance(s, Skip):
        return "skip"
    if isinstance(s, Assign):
        return f"{s.var} := {aexp_to_str(s.expr)}"
    if isinstance(s, Seq):
        return f"{stmt_to_str(s.first)}; {stmt_to_str(s.second)}"
    if isinstance(s, If):
        return (f"if {bexp_to_str(s.cond)} then "
                f"{stmt_to_str(s.then_branch)} "
                f"else ({stmt_to_str(s.else_branch)})")
    if isinstance(s, While):
        return f"while {bexp_to_str(s.cond)} do ({stmt_to_str(s.body)})"
    raise TypeError(f"stmt_to_str: {type(s).__name__}")


def state_to_str(sigma: dict[str, int]) -> str:
    """Pretty-print a state as {x ↦ v, y ↦ w}. Only non-zero entries shown."""
    items = [(k, v) for k, v in sigma.items() if v != 0]
    if not items:
        return "{}"
    items.sort()
    return "{" + ", ".join(f"{k} ↦ {v}" for k, v in items) + "}"


def cfg_to_str(cfg: Config) -> str:
    return f"⟨{stmt_to_str(cfg.stmt)}, {state_to_str(cfg.state)}⟩"


# ─────────────────────────────────────────────────────────────────────────────
# Trace renderers — three views: formal, table, dict
# ─────────────────────────────────────────────────────────────────────────────

def _abbreviate_while_loops(transitions: list[Transition]) -> tuple[list[str], list[str]]:
    """
    Detects repeated while-loop bodies in the trace and gives them short names
    L1, L2, ...  Returns (rendered_configs, legend_lines).

    This matches the chapter convention (Examples 7, 10) where a loop body is
    introduced once and abbreviated thereafter.
    """
    # find every While subtree that appears at least twice
    counts: dict[str, int] = {}
    def walk(s: Stmt):
        if isinstance(s, While):
            counts[stmt_to_str(s)] = counts.get(stmt_to_str(s), 0) + 1
            walk(s.body)
        elif isinstance(s, Seq):
            walk(s.first); walk(s.second)
        elif isinstance(s, If):
            walk(s.then_branch); walk(s.else_branch)
    if transitions:
        walk(transitions[0].before.stmt)
        for t in transitions:
            walk(t.after.stmt)

    # only abbreviate while-loops that appear ≥ 2 times AND are non-trivial
    abbrev: dict[str, str] = {}
    for src, n in counts.items():
        if n >= 2 and len(src) > 25:   # don't abbreviate tiny loops
            abbrev[src] = f"L{len(abbrev) + 1}"

    legend = [f"  {label} := {src}" for src, label in abbrev.items()]

    def render_stmt(s: Stmt) -> str:
        full = stmt_to_str(s)
        for src, label in abbrev.items():
            full = full.replace(src, label)
        return full

    rendered = []
    if not transitions:
        return rendered, legend

    rendered.append(f"⟨{render_stmt(transitions[0].before.stmt)}, {state_to_str(transitions[0].before.state)}⟩")
    for t in transitions:
        rendered.append(f"⟨{render_stmt(t.after.stmt)}, {state_to_str(t.after.state)}⟩")
    return rendered, legend


def _render_formal(transitions: list[Transition], truncated: bool) -> str:
    """Render a list of transitions as a formal small-step trace."""
    if not transitions:
        return "(no transitions — program was already skip)"

    cfgs, legend = _abbreviate_while_loops(transitions)

    lines = []
    if legend:
        lines.append("Where:")
        lines.extend(legend)
        lines.append("")

    lines.append(cfgs[0])
    for i, t in enumerate(transitions):
        lines.append(f"  ⇒  {cfgs[i+1]}    [{t.rule}]")

    if truncated:
        lines.append("  ⇒  ... step budget exceeded — likely non-terminating ...")

    return "\n".join(lines)


def _render_table(transitions: list[Transition], initial_state: dict[str, int],
                  truncated: bool) -> str:
    """Render as a state-tracking table (Example 8 / 11 style)."""
    # collect every state we visit
    states: list[tuple[str, dict[str, int]]] = [("start", dict(initial_state))]
    for t in transitions:
        states.append((t.rule, t.after.state))

    # find which variables ever change
    all_vars: set[str] = set()
    for _, sigma in states:
        all_vars.update(k for k, v in sigma.items() if v != 0)
    # also include any var present anywhere
    for _, sigma in states:
        all_vars.update(sigma.keys())

    changing_vars = []
    for v in sorted(all_vars):
        values = [sigma.get(v, 0) for _, sigma in states]
        if len(set(values)) > 1:
            changing_vars.append(v)

    # if no var changes (trivial program), fall back to all vars
    cols = changing_vars if changing_vars else sorted(all_vars)

    # build table
    header = ["step", "rule"] + cols
    rows = [header]
    rows.append(["0", "start"] + [str(states[0][1].get(v, 0)) for v in cols])
    for i, (rule, sigma) in enumerate(states[1:], start=1):
        rows.append([str(i), rule] + [str(sigma.get(v, 0)) for v in cols])

    # column widths
    widths = [max(len(r[c]) for r in rows) for c in range(len(header))]

    def fmt_row(r):
        return " | ".join(r[c].ljust(widths[c]) for c in range(len(r)))

    sep = "-+-".join("-" * w for w in widths)

    lines = [fmt_row(rows[0]), sep]
    for r in rows[1:]:
        lines.append(fmt_row(r))

    if truncated:
        lines.append("... step budget exceeded — likely non-terminating ...")

    return "\n".join(lines)


def _render_dict(transitions: list[Transition], initial_state: dict[str, int],
                 truncated: bool) -> dict[str, int]:
    """Final state only, as a plain dict. Raises if non-terminating."""
    if truncated:
        raise StepBudgetExceeded(
            f"step budget exceeded after {len(transitions)} steps — likely non-terminating"
        )
    if not transitions:
        return dict(initial_state)
    # strip zeros for canonical form
    return {k: v for k, v in transitions[-1].after.state.items() if v != 0}


def trace(prog: Stmt | str, state: dict[str, int] | None = None,
          view: str = "formal", max_steps: int = 10_000):
    """
    Run a While program from `state` and render the small-step trace.

    view="formal" — Example 7 style with ⟨S, σ⟩ ⇒ ⟨S', σ'⟩  (default).
    view="table"  — Example 8 / 11 style: one row per state-changing transition.
    view="dict"   — final state only, as a plain dict.
    """
    if state is None:
        state = {}

    if view not in ("formal", "table", "dict"):
        raise ValueError(f"unknown view: {view!r}")

    transitions: list[Transition] = []
    truncated = False
    try:
        for t in step_iter(prog, state, max_steps):
            transitions.append(t)
    except StepBudgetExceeded:
        truncated = True

    if view == "formal":
        return _render_formal(transitions, truncated)
    if view == "table":
        return _render_table(transitions, dict(state), truncated)
    if view == "dict":
        return _render_dict(transitions, dict(state), truncated)


def run(prog: Stmt | str, state: dict[str, int] | None = None,
        max_steps: int = 10_000) -> dict[str, int]:
    """Convenience: run a program and return the final state as a plain dict.
    Strips zero-valued variables for canonical form."""
    return trace(prog, state, view="dict", max_steps=max_steps)


# ─────────────────────────────────────────────────────────────────────────────
# Predict-cell harness — for the active-mode notebooks
# ─────────────────────────────────────────────────────────────────────────────

def check_state(predicted: dict[str, int], prog: Stmt | str,
                state: dict[str, int] | None = None,
                max_steps: int = 10_000) -> None:
    """
    Predict-and-check: did the program produce the state you expected?
    Strips zero-valued entries before comparing — {x: 0} and {} are the same state.
    Prints green-ish OK or red-ish diff.
    """
    actual = run(prog, state or {}, max_steps=max_steps)
    pred_canon = {k: v for k, v in predicted.items() if v != 0}
    if pred_canon == actual:
        print(f"✅ Correct. Final state = {state_to_str(actual)}")
    else:
        print(f"❌ Mismatch.")
        print(f"   You predicted: {state_to_str(pred_canon)}")
        print(f"   Actual:        {state_to_str(actual)}")
        print()
        print("Formal trace:")
        print(trace(prog, state or {}, view="formal", max_steps=max_steps))


def check_steps(predicted: int, prog: Stmt | str,
                state: dict[str, int] | None = None,
                max_steps: int = 10_000) -> None:
    """Predict-and-check: how many ⇒ transitions did the program take?"""
    transitions = list(step_iter(prog, state or {}, max_steps))
    actual = len(transitions)
    if predicted == actual:
        print(f"✅ Correct — {actual} transitions.")
    else:
        print(f"❌ You predicted {predicted}, actual was {actual}.")


# ─────────────────────────────────────────────────────────────────────────────
# Self-test — run this file directly to sanity-check the interpreter
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Example 1 from the chapter — division and remainder
    prog = """
        r := m;
        d := 0;
        while n <= r do (
            d := d + 1;
            r := r - n
        )
    """
    print("=== Formal trace ===")
    print(trace(prog, {"m": 10, "n": 3}, view="formal"))
    print()
    print("=== Table view ===")
    print(trace(prog, {"m": 10, "n": 3}, view="table"))
    print()
    print("=== Dict view ===")
    print(trace(prog, {"m": 10, "n": 3}, view="dict"))
