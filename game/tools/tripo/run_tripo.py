"""Use Brainrot's runner, with local gate paths and no network or paid mode."""

import contextlib
from functools import partial
import importlib.util
import io
from pathlib import Path
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True
import preflight


def refuse_network(event, arguments):
    if event in ('socket.__new__', 'socket.connect', 'socket.getaddrinfo'):
        raise preflight.Refused('local: all network and gate-service sockets are disabled')


def local_gate_call(**request):
    if request.get('op') != 'check':
        raise preflight.Refused('local: only an offline check is permitted; paid operations are disabled')
    report = io.StringIO()
    with contextlib.redirect_stdout(report):
        try:
            preflight.run_static(request['plan'], preflight.Paths())
        except preflight.Refused as error:
            print(f'REFUSED: {error}')
            return {'ok': False, 'report': report.getvalue()}
    return {'ok': True, 'report': report.getvalue() + 'PREFLIGHT PASS\n'}


def main():
    arguments = sys.argv[1:]
    if '--dry-run' not in arguments and '--help' not in arguments:
        print('REFUSED: --dry-run is mandatory; this wrapper cannot submit paid jobs', file=sys.stderr)
        return 3
    if any(argument == '--no-quad' or argument.startswith('--gate-root') for argument in arguments):
        print('REFUSED: quads are required and alternate gate roots are disabled', file=sys.stderr)
        return 3
    sys.addaudithook(refuse_network)
    spec = importlib.util.spec_from_file_location('bananaville_shared_runner', preflight.UPSTREAM / 'run_tripo.py')
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    runner.argparse = SimpleNamespace(ArgumentParser=partial(runner.argparse.ArgumentParser, allow_abbrev=False))
    runner.ROOT = str(preflight.ROOT)
    runner.APPROVALS = preflight.Paths().approvals
    runner.LEDGER = preflight.Paths().ledger
    runner.OUTDIR = str(Path(__file__).resolve().parent / 'out')
    runner.BATCH_CAP = 600
    runner.gate_call = local_gate_call
    try:
        runner.main()
    except preflight.Refused as error:
        print(f'REFUSED: {error}', file=sys.stderr)
        return 3
    return 0


if __name__ == '__main__':
    sys.exit(main())
