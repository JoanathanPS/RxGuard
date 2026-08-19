"""Checking engines.

The two engines are kept deliberately independent (spec §14): the AI-assisted
engine and the Manual-Simulated engine share *no* code — the manual path must
never secretly reuse the ML classifier or the LLM, or the comparative study in
Module 4 is meaningless.
"""

from interaction_app.engines.ai_engine import run_ai_engine
from interaction_app.engines.manual_engine import run_manual_engine

__all__ = ["run_ai_engine", "run_manual_engine"]
