import unittest
from unittest.mock import patch
import collector

class CollectorTests(unittest.TestCase):
    def test_unknown_secret_flags_and_values_are_not_forwarded(self):
        command = collector.safe_command(['/bin/python', '/private/train.py', '--new-secret=supersecret', '--password', 'hunter2', 'sk-private'])
        for private in ['supersecret', 'hunter2', 'sk-private', '/private/train.py']:
            self.assertNotIn(private, command)
        self.assertEqual(command, 'python --new-secret --password')

    def test_units_cross_gpu_pid_and_unknown_task(self):
        def query(args):
            if args[0] == 'df':
                return 'Size Used Avail Mounted on\n10737418240 2147483648 7516192768 /data\n'
            if 'query-compute-apps' in args[1]:
                return 'GPU-a, 1234, 1024\nGPU-b, 1234, 2048\n'
            return '0, GPU-a, A800, 81920, 2048, 25, 40, 100\n1, GPU-b, A800, 81920, 3072, 30, 42, 110\n'
        with patch.object(collector, 'query', query), patch.object(collector, 'process_info', lambda _: {'user': 'test', 'command': 'python'}):
            s = collector.snapshot()
        self.assertEqual(s['gpus'][0]['memoryTotal'], 80)
        self.assertEqual(s['gpus'][0]['unattributedMemory'], 1)
        self.assertEqual(s['disks'][0]['total'], 10)
        self.assertEqual(s['disks'][0]['available'], 7)
        self.assertEqual(len(s['processes']), 2)
        self.assertEqual(s['processes'][0]['taskSource'], 'unknown')

    def test_unavailable_gpu_metrics_fail(self):
        with patch.object(collector, 'query', lambda _: '0, GPU-a, A800, 81920, 2048, N/A, 40, 100\n'):
            with self.assertRaises(ValueError):
                collector.snapshot()

if __name__ == '__main__':
    unittest.main()
