"""Read-only Linux/NVIDIA collector. JSON on stdout; never emits raw argv."""
import csv
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import pwd
import re
import socket
import subprocess
import sys
import time
import uuid


def query(arguments):
    return subprocess.run(arguments, check=True, capture_output=True, text=True,
                          timeout=8, env={**os.environ, 'LC_ALL': 'C'}).stdout


def number(value):
    result = float(value.strip())
    if not 0 <= result < float('inf'):
        raise ValueError('invalid numeric metric')
    return result


def safe_command(argv):
    # Never forward arbitrary argument values, paths, scripts or credentials.
    # This conservative projection also covers unknown credential flag names.
    if not argv:
        return '不可读取（进程退出或权限不足）'
    executable = re.sub(r'[^\w.+:-]', '_', Path(argv[0]).name)[:80] or '未知程序'
    flags = [a.split('=', 1)[0] for a in argv[1:]
             if re.fullmatch(r'--?[a-zA-Z][a-zA-Z0-9_-]*(?:=.*)?', a)]
    return (executable + (' ' + ' '.join(flags) if flags else ''))[:500]


def process_info(pid):
    root = Path('/proc') / str(pid)
    try:
        stat = (root / 'stat').read_text()
        ticks = float(stat[stat.rfind(')') + 2:].split()[19])
        boot = time.time() - float(Path('/proc/uptime').read_text().split()[0])
        started = datetime.fromtimestamp(boot + ticks / os.sysconf('SC_CLK_TCK'), timezone.utc).isoformat().replace('+00:00', 'Z')
        try:
            user = pwd.getpwuid(root.stat().st_uid).pw_name
        except KeyError:
            user = str(root.stat().st_uid)
        try:
            argv = [a.decode(errors='replace') for a in (root / 'cmdline').read_bytes().split(b'\0') if a]
            command = safe_command(argv)
        except OSError:
            command = '不可读取（进程退出或权限不足）'
        return {'user': user[:80], 'command': command, 'startedAt': started}
    except (OSError, ValueError, IndexError):
        return {'user': '未知（退出或权限不足）', 'command': '不可读取（进程退出或权限不足）'}


def snapshot():
    gpus = []
    raw = query(['nvidia-smi', '--query-gpu=index,uuid,name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw', '--format=csv,noheader,nounits'])
    for row in csv.reader(io.StringIO(raw)):
        if len(row) != 8:
            raise ValueError('invalid GPU record')
        index, uid, name, total, used, utilization, temperature, power = map(str.strip, row)
        gpus.append({'id': int(index), 'uuid': uid, 'name': name, 'memoryTotal': number(total) / 1024,
                     'memoryUsed': number(used) / 1024, 'utilization': number(utilization),
                     'temperature': number(temperature), 'power': number(power), 'process': '—', 'pid': None})
    if not gpus:
        raise ValueError('no GPU data')
    ids = {g['uuid']: g['id'] for g in gpus}
    processes = []
    seen = set()
    raw = query(['nvidia-smi', '--query-compute-apps=gpu_uuid,pid,used_memory', '--format=csv,noheader,nounits'])
    for row in csv.reader(io.StringIO(raw)):
        if len(row) != 3:
            raise ValueError('invalid process record')
        uid, pid, memory = map(str.strip, row)
        if uid not in ids:
            raise ValueError('process GPU is missing')
        key = (ids[uid], int(pid))
        if key in seen:
            continue
        seen.add(key)
        processes.append({'gpuId': key[0], 'pid': key[1], 'memoryUsed': number(memory) / 1024,
                          'task': '未知用途', 'taskSource': 'unknown', **process_info(key[1])})
    for gpu in gpus:
        assigned = [p for p in processes if p['gpuId'] == gpu['id']]
        if assigned:
            main = max(assigned, key=lambda p: p['memoryUsed'])
            gpu.update(pid=main['pid'], process=main['command'][:100])
        gpu['unattributedMemory'] = max(0, gpu['memoryUsed'] - sum(p['memoryUsed'] for p in assigned))
    disks = []
    raw = query(['df', '-B1', '--output=size,used,avail,target', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'overlay', '-x', 'efivarfs'])
    for line in raw.splitlines()[1:]:
        total, used, available, mount = line.split(maxsplit=3)
        disks.append({'mount': mount, 'total': number(total) / 2**30, 'used': number(used) / 2**30, 'available': number(available) / 2**30})
    return {'schemaVersion': '1.0', 'id': 'sample-' + str(uuid.uuid4()), 'server': socket.gethostname(),
            'source': 'script', 'capacityUnit': 'GiB', 'scenario': 'normal',
            'capturedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'gpus': gpus, 'processes': processes, 'disks': disks, 'history': []}


if __name__ == '__main__':
    try:
        print(json.dumps(snapshot(), ensure_ascii=False, allow_nan=False))
    except Exception:
        # Suppress driver output / argv that could expose sensitive information.
        print('Read-only collection failed; check NVIDIA driver and filesystem access.', file=sys.stderr)
        sys.exit(1)
