"""Read-only allocated-byte scan using directory descriptors; no symlink traversal."""
import json, os, stat, sys, time

def emit(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)

def scan(path, root):
    if os.path.realpath(root) != root or os.path.commonpath([path, root]) != root:
        raise ValueError('invalid scan path')
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open(root, flags)
    try:
        for component in os.path.relpath(path, root).split(os.sep):
            if component == '.':
                continue
            next_fd = os.open(component, flags, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        start = os.fstat(fd)
        mounts = set()
        try:
            with open('/proc/self/mountinfo') as lines:
                for line in lines:
                    value = line.split()[4]
                    for escaped, literal in [('\\040', ' '), ('\\011', '\t'), ('\\012', '\n'), ('\\134', '\\')]:
                        value = value.replace(escaped, literal)
                    mounts.add(value)
        except OSError:
            pass
        seen = {(start.st_dev, start.st_ino)}
        total = start.st_blocks * 512
        errors = 0
        with os.scandir(fd) as children:
            names = []
            for child in children:
                names.append(child.name)
                if len(names) > 10000:
                    raise ValueError('too many direct entries')
        for name in sorted(names):
            row = {'path': os.path.join(path, name), 'bytes': 0, 'apparentBytes': 0, 'complete': False, 'errors': 0, 'skippedMount': False}
            last_emit = time.monotonic()
            def walk(parent_fd, child_name, display, depth):
                nonlocal last_emit
                if depth > 128 or len(seen) > 500000:
                    row['errors'] += 1
                    return
                opened = None
                try:
                    value = os.stat(child_name, dir_fd=parent_fd, follow_symlinks=False)
                    if value.st_dev != start.st_dev or display in mounts:
                        row['skippedMount'] = depth == 0 or row['skippedMount']
                        return
                    if stat.S_ISDIR(value.st_mode):
                        opened = os.open(child_name, flags, dir_fd=parent_fd)
                        value = os.fstat(opened)
                        if value.st_dev != start.st_dev:
                            row['skippedMount'] = depth == 0 or row['skippedMount']
                            return
                    key = (value.st_dev, value.st_ino)
                    if key in seen:
                        return
                    seen.add(key)
                    row['bytes'] += value.st_blocks * 512
                    row['apparentBytes'] += value.st_size
                    if time.monotonic() - last_emit >= 1:
                        emit({'type': 'row', 'row': row})
                        last_emit = time.monotonic()
                    if opened is not None:
                        with os.scandir(opened) as descendants:
                            for descendant in descendants:
                                walk(opened, descendant.name, os.path.join(display, descendant.name), depth + 1)
                except OSError:
                    row['errors'] += 1
                finally:
                    if opened is not None:
                        os.close(opened)
            emit({'type': 'row', 'row': row})
            walk(fd, name, row['path'], 0)
            row['complete'] = row['errors'] == 0
            errors += row['errors']
            total += row['bytes']
            emit({'type': 'row', 'row': row})
        emit({'type': 'done', 'totalBytes': total, 'rootBytes': start.st_blocks * 512, 'errors': errors})
    finally:
        os.close(fd)

if __name__ == '__main__':
    try:
        scan(os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]))
    except Exception:
        emit({'type': 'error', 'error': '目录不可读取或扫描失败，请选择更小的目录或检查权限'})
        sys.exit(1)
