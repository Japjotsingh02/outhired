import { test } from "node:test";
import assert from "node:assert/strict";
import { profileUpdateSchema } from "@/lib/schemas/profile";
import { isProfileComplete } from "@/lib/profile";

const ok = (input: unknown) => profileUpdateSchema.safeParse(input);

test("empty strings on nullable fields become null", () => {
  const result = ok({
    headline: "",
    linkedinUrl: "  ",
    githubUrl: "",
    portfolioUrl: "",
    resumeText: "",
    experienceYrs: "",
  });
  assert.ok(result.success);
  assert.deepEqual(result.data, {
    headline: null,
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
    resumeText: null,
    experienceYrs: null,
  });
});

test("every field is optional", () => {
  assert.ok(ok({}).success);
});

test("unknown keys are rejected (strict)", () => {
  assert.equal(ok({ passwordHash: "x" }).success, false);
  assert.equal(ok({ linkedinData: {} }).success, false);
});

test("linkedin url must be https linkedin.com/in/<slug> (regional hosts allowed)", () => {
  assert.ok(ok({ linkedinUrl: "https://linkedin.com/in/yourname" }).success);
  assert.ok(ok({ linkedinUrl: "https://www.linkedin.com/in/your-name/" }).success);
  assert.ok(ok({ linkedinUrl: "https://uk.linkedin.com/in/yourname" }).success);
  assert.ok(ok({ linkedinUrl: "https://in.linkedin.com/in/yourname" }).success);
  assert.equal(ok({ linkedinUrl: "http://linkedin.com/in/yourname" }).success, false);
  assert.equal(ok({ linkedinUrl: "https://linkedin.com/company/acme" }).success, false);
  assert.equal(ok({ linkedinUrl: "https://evil.com/in/yourname" }).success, false);
  assert.equal(ok({ linkedinUrl: "https://linkedin.com.evil.com/in/x" }).success, false);
  assert.equal(ok({ linkedinUrl: "https://evil.com/linkedin.com/in/x" }).success, false);
  assert.equal(ok({ linkedinUrl: "https://notlinkedin.com/in/x" }).success, false);
  assert.equal(ok({ linkedinUrl: "https://m.linkedin.com/in/x" }).success, false);
  assert.equal(ok({ linkedinUrl: "https://uk.linkedin.com/in/x/details" }).success, false);
});

test("linkedin url is normalised to https://www.linkedin.com/in/<slug>", () => {
  for (const input of [
    "https://linkedin.com/in/Jane-Doe",
    "https://www.linkedin.com/in/Jane-Doe/",
    "https://uk.linkedin.com/in/Jane-Doe?trk=public_profile#top",
    "  https://LINKEDIN.com/in/Jane-Doe  ",
  ]) {
    const result = ok({ linkedinUrl: input });
    assert.ok(result.success, input);
    assert.equal(result.data.linkedinUrl, "https://www.linkedin.com/in/Jane-Doe", input);
  }
});

test("github url must be https github.com/<user>", () => {
  assert.ok(ok({ githubUrl: "https://github.com/octocat" }).success);
  assert.equal(ok({ githubUrl: "https://github.com/octocat/repo" }).success, false);
  assert.equal(ok({ githubUrl: "https://gitlab.com/octocat" }).success, false);
});

test("portfolio url accepts http and https only", () => {
  assert.ok(ok({ portfolioUrl: "http://example.com" }).success);
  assert.ok(ok({ portfolioUrl: "https://example.dev/me" }).success);
  assert.equal(ok({ portfolioUrl: "ftp://example.com" }).success, false);
  assert.equal(ok({ portfolioUrl: "javascript:alert(1)" }).success, false);
});

test("limits: skills, experience, name, lengths", () => {
  assert.equal(ok({ skills: Array.from({ length: 51 }, (_, i) => `s${i}`) }).success, false);
  assert.equal(ok({ skills: ["x".repeat(51)] }).success, false);
  assert.equal(ok({ skills: [""] }).success, false);
  assert.equal(ok({ experienceYrs: 61 }).success, false);
  assert.equal(ok({ experienceYrs: -1 }).success, false);
  assert.ok(ok({ experienceYrs: 0 }).success);
  assert.equal(ok({ name: "   " }).success, false);
  assert.equal(ok({ headline: "x".repeat(201) }).success, false);
  assert.equal(ok({ resumeText: "x".repeat(30001) }).success, false);
});

test("skills are trimmed", () => {
  const result = ok({ skills: ["  React  "] });
  assert.ok(result.success);
  assert.deepEqual(result.data.skills, ["React"]);
});

test("isProfileComplete: (linkedin or resume) and 3+ skills", () => {
  const skills = ["a", "b", "c"];
  assert.equal(isProfileComplete({ linkedinUrl: "https://linkedin.com/in/x", skills }), true);
  assert.equal(isProfileComplete({ resumeText: "my resume", skills }), true);
  assert.equal(isProfileComplete({ resumeText: "   ", skills }), false);
  assert.equal(isProfileComplete({ linkedinUrl: "https://linkedin.com/in/x", skills: ["a", "b"] }), false);
  assert.equal(isProfileComplete({ skills }), false);
});
