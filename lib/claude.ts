import Anthropic from "@anthropic-ai/sdk";
import type { ProfileMatchResult } from "@/types";

export async function compareProfiles(
  userProfileText: string,
  candidateProfileText: string,
  jobTitle: string,
): Promise<ProfileMatchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Return a mock when no key is set
    return {
      score: 0,
      summary: "ANTHROPIC_API_KEY not configured. Please add it to your .env.local file.",
      sharedStrengths: [],
      gaps: [],
      advice: "Set ANTHROPIC_API_KEY to enable AI profile comparison.",
    };
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are an expert talent analyst. You compare two LinkedIn-style professional profiles and assess how closely the USER's profile matches the HIRED CANDIDATE's profile for a specific job role.

Return ONLY valid JSON with this exact shape:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence professional assessment>",
  "sharedStrengths": ["<strength 1>", "<strength 2>", ...],
  "gaps": ["<gap 1>", "<gap 2>", ...],
  "advice": "<2-3 sentences of specific, actionable advice>"
}

Scoring guide:
- 80-100: Very strong match — similar background, skills, seniority
- 60-79: Good match — overlapping skills, some experience gaps  
- 40-59: Moderate match — relevant skills but notable differences
- 20-39: Weak match — different backgrounds or major skill gaps
- 0-19: Poor match — significantly different profiles`;

  const userPrompt = `Compare these two profiles for the role: **${jobTitle}**

--- USER'S PROFILE ---
${userProfileText}

--- HIRED CANDIDATE'S PROFILE ---
${candidateProfileText}

Analyze the match and return JSON.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  // Extract JSON from the response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude returned invalid JSON response");
  }

  return JSON.parse(jsonMatch[0]) as ProfileMatchResult;
}
