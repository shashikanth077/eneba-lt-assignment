<?php

declare(strict_types=1);

namespace Tests;

/**
 * REVIEW.md S4: the login limiter used to CHECK the counters, then verify the password, then RECORD the failure. Requests that arrive
 * together all pass the check before any of them records anything, so a burst of N parallel guesses got N tries instead of 5.
 * The attempt is now counted BEFORE the password is looked at, so at most `max` requests can ever reach password_verify.
 */
final class LoginRaceTest extends DbTestCase
{
    private const EMAIL = 'victim@example.com';
    private const IP = '203.0.113.50';

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('TRUNCATE TABLE login_attempts');
        self::$pdo->prepare('DELETE FROM users WHERE email = ?')->execute([self::EMAIL]);
    }

    /** @return list<array<string, mixed>> */
    private function burst(int $count): array
    {
        $startAt = microtime(true) + 1.5 + 0.12 * $count;
        $running = [];
        for ($n = 1; $n <= $count; $n++) {
            $process = proc_open(
                [PHP_BINARY, __DIR__ . '/bin/shop_race.php', 'login', self::EMAIL . '|' . self::IP . "|$n", sprintf('%.6F', $startAt), (string) $_ENV['DB_NAME']],
                [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                $pipes,
            );
            self::assertIsResource($process);
            $running[] = [$process, $pipes];
        }
        $results = [];
        foreach ($running as [$process, $pipes]) {
            $out = trim((string) stream_get_contents($pipes[1]));
            $err = trim((string) stream_get_contents($pipes[2]));
            proc_close($process);
            $decoded = json_decode((string) array_slice(explode("\n", $out), -1)[0], true);
            self::assertIsArray($decoded, "racer printed no result. stdout: $out stderr: $err");
            $results[] = $decoded;
        }

        return $results;
    }

    public function testAParallelBurstOfWrongPasswordsGetsNoMoreTriesThanTheLimit(): void
    {
        $codes = array_count_values(array_column($this->burst(16), 'code'));

        self::assertLessThanOrEqual(5, $codes['invalid_credentials'] ?? 0, 'at most 5 guesses may reach the password check: ' . json_encode($codes));
        self::assertGreaterThanOrEqual(11, $codes['too_many_attempts'] ?? 0, 'everything else is turned away: ' . json_encode($codes));
    }

    public function testASuccessfulLoginStillClearsTheCounterAndNormalUseIsUnaffected(): void
    {
        $user = $this->post('/api/auth/register', ['email' => self::EMAIL, 'password' => 'correct horse 9', 'displayName' => 'Victim']);
        self::assertSame(201, $user->getStatusCode());
        foreach ([1, 2, 3, 4] as $n) {
            self::assertSame(401, $this->send('POST', '/api/auth/login', ['email' => self::EMAIL, 'password' => "bad-$n"], null, self::IP)->getStatusCode());
        }
        self::assertSame(200, $this->send('POST', '/api/auth/login', ['email' => self::EMAIL, 'password' => 'correct horse 9'], null, self::IP)->getStatusCode(), 'the 5th attempt may still be the right one');
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM login_attempts')->fetchColumn(), 'success wipes the pair counter, including the attempt that was just claimed');
        self::assertSame(401, $this->send('POST', '/api/auth/login', ['email' => self::EMAIL, 'password' => 'bad-again'], null, self::IP)->getStatusCode());
    }

    private function post(string $path, array $body): \Psr\Http\Message\ResponseInterface
    {
        return $this->send('POST', $path, $body, null, self::IP);
    }
}
