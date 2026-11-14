"""Bind Brainrot's unchanged preflight checks to Bananaville's gate files."""

import importlib.util
from pathlib import Path
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
UPSTREAM = Path('/home/moo/Workspace/Brainrot-Boss-Rush/pipeline/tripo')
INPUTS = ROOT / 'concept/tripo/businessman/inputs'
spec = importlib.util.spec_from_file_location('bananaville_shared_preflight', UPSTREAM / 'preflight.py')
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
shared.SKILL = '/home/moo/.claude/skills/tripo-best-practices/SKILL.md'
shared.OVERRIDES = str(ROOT / 'approvals/TRIPO_OVERRIDES.md')
Refused = shared.Refused
original_skill_rules = shared.skill_rules


def skill_rules():
    rules = original_skill_rules()
    rules['input_provenance'] = str(INPUTS / 'provenance.json')
    return rules


shared.skill_rules = skill_rules


class Paths(shared.Paths):
    def __init__(self, gate_root=None):
        if gate_root:
            raise Refused('local: alternate gate roots are disabled')
        self.test = False
        self.root = str(ROOT)
        self.approvals = str(ROOT / 'approvals/APPROVED_SHEETS.md')
        self.docs = str(HERE / 'DOCS_CHECK.md')
        self.consistency = str(HERE / 'consistency')
        self.ledger = str(HERE / 'ledger.csv')


def run_static(plan, paths, today=None):
    if (plan['name'] != 'businessman_body' or plan['model_version'] != 'P2-20260801'
            or not plan.get('no_texture') or plan.get('pbr')
            or plan.get('face_limit') != 8000 or plan.get('kind') != 'limbed'):
        raise Refused('local: businessman_body requires P2-20260801, --no-texture, --face-limit 8000, --kind limbed')
    if any(not Path(path).resolve().is_relative_to(INPUTS) for path in plan['inputs'].values()):
        raise Refused('local: inputs must stay in concept/tripo/businessman/inputs')
    docs = shared.read_docs(paths)
    estimate, spent, cap, message = shared.check_cost(paths, docs, plan)
    if cap != 600:
        raise Refused('local: batch cap must remain exactly 600 credits')
    print(f'COST ESTIMATE: {estimate} credits; batch {spent:g} + {estimate} / {cap}; dry-run, 0 charged')
    print('PREFLIGHT local recipe ok: P2-20260801 quad=true texture=false pbr=false face_limit=8000; body only')
    missing = [role for role, path in plan['inputs'].items() if not Path(path).is_file()]
    if missing:
        checks = (
            ('a', lambda: shared.check_approvals(paths, plan['inputs'])),
            ('b', lambda: shared.check_model(docs, plan, today)),
            ('c', lambda: shared.check_slot(docs, plan)),
            ('f', lambda: message),
        )
        for label, check in checks:
            try:
                print(f'PREFLIGHT {label} ok: {check()}')
            except Refused as error:
                print(f'PREFLIGHT {label} FAIL: {error}')
        print(f'PREFLIGHT d FAIL: missing crops: {", ".join(missing)}')
        print('PREFLIGHT e BLOCKED: no images to review; consistency verdict remains pending')
        print('PREFLIGHT g BLOCKED: no images or crop provenance; no image checks marked pass')
        raise Refused('inputs not generated; approval empty; no upload or paid job is possible')
    estimate = shared.run_static(plan, paths, today)
    info, _ = shared.check_images(plan['inputs'])
    if any(not 0.70 <= view['height'] <= 0.85 for view in info.values()):
        raise Refused('local: subject height must be 70–85% of the frame')
    return estimate


def __getattr__(name):
    return getattr(shared, name)
