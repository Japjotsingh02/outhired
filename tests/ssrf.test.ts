import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeUrl } from "@/server/security/ssrf";

const realConsoleError = console.error;

test("blocks private, loopback, link-local and metadata addresses", async () => {
  console.error = () => {};
  try {
    for (const url of [
      "http://127.0.0.1/",
      "http://127.1.2.3/",
      "http://10.0.0.5/",
      "http://172.16.0.1/",
      "http://172.31.255.255/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[fc00::1]/",
      "http://[fd12:3456::1]/",
      "http://[fe80::1]/",
      "http://localhost/",
      "http://foo.localhost/",
      "http://metadata.google.internal/",
      "ftp://example.com/",
      "http://user:pass@example.com/",
      "not a url",
    ]) {
      assert.equal(await isSafeUrl(url), false, url);
    }
  } finally {
    console.error = realConsoleError;
  }
});

test("allows public addresses", async () => {
  assert.equal(await isSafeUrl("http://93.184.216.34/"), true);
  assert.equal(await isSafeUrl("https://[2606:4700:4700::1111]/"), true);
  assert.equal(await isSafeUrl("http://172.32.0.1/"), true);
});
