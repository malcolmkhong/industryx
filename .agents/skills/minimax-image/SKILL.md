---
name: minimax-image
description: >
  Generate images via the MiniMax `image-01` text-to-image model. Use when the user
  wants any visual asset produced from text: images, artwork, UI mockups, wireframes,
  diagrams, flowcharts, concept art, marketing visuals, social media graphics, product
  renders, icons, logos, or illustrations. Trigger phrases: "generate an image",
  "create an image", "draw", "make a diagram", "generate artwork", "UI mockup",
  "wireframe", "concept art", "product render", "social media graphic", "marketing
  visual", "icon", "logo", "visual asset", "build me an image". Do NOT use this
  skill for video, animation, or 3D — use a separate video generation skill.
version: 1.0.0
---

## MiniMax Image Generation Skill

**Model:** `image-01` (text-to-image). Only this model is supported in this project's MCP server.

**Endpoint:** `POST https://api.minimax.io/v1/image_generation`
**Auth:** `Authorization: Bearer <MINIMAX_API_KEY>`. Fail-closed: no fallback secret.

**MCP server:** `C:\Users\malco\mcp\minimax-image\index.js` exposes this as the
`generate_image` tool. The MCP wrapper handles response parsing (`data.data.image_urls[]`).

## How to Call

```powershell
$headers = @{
  "Authorization" = "Bearer $env:MINIMAX_API_KEY"
  "Content-Type"  = "application/json"
}
$body = @{
  model          = "image-01"
  prompt         = "<user description>"
  aspect_ratio   = "1:1"
  n              = 1
  response_format = "base64"
} | ConvertTo-Json -Compress

$response = Invoke-RestMethod -Uri "https://api.minimax.io/v1/image_generation" `
  -Method POST `
  -Headers $headers `
  -Body $body

# Result: $response.data.image_base64[0]
```

The response contains `data.image_base64[]`. Pass `response_format: "url"` to
receive `data.image_urls[]` (URLs valid for 24 hours) instead.

## Parameters

| Param | Required | Default | Notes |
|---|---|---|---|
| `model` | Yes | — | `image-01` is the only supported model |
| `prompt` | Yes | — | Text description, max 1500 chars |
| `aspect_ratio` | No | `1:1` | `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16`, `21:9` |
| `n` | No | `1` | 1–9 images per request |
| `response_format` | No | `base64` | `url` (24h expiry) or `base64` |
| `prompt_optimizer` | No | `false` | Set `true` to let the API auto-enhance simple prompts |

## Prompting for Style

This skill has no `style` parameter. To get stylized output, embed the style in the
prompt itself. Phrases that work well:

- "flat design vector logo, minimalist icon, no gradients, no shadows"
- "isometric 2D illustration, clean shapes, limited color palette"
- "watercolor illustration, soft edges, paper texture"
- "photorealistic product photo, studio lighting, shallow depth of field"

Be concrete about colors with hex codes when the project has a known palette. For
example, IndustriaX uses warm orange `#E67E22`, charcoal gray `#2D2D2D`, and cream
white `#F5F5DC`.

## Worked Example

User asks: "Generate a 1:1 logo for our industrial tycoon game."

```json
{
  "model": "image-01",
  "prompt": "Clean flat design vector logo for an industrial tycoon game. Bold factory with three smokestacks and large mechanical gears. Colors: warm orange #E67E22, charcoal gray #2D2D2D, cream white #F5F5DC. Minimalist icon, centered, square composition, no gradients, no shadows.",
  "aspect_ratio": "1:1",
  "n": 1,
  "response_format": "base64"
}
```

After the API call, return the base64 string (or save it to a file if the user wants
it persisted). The base64 data does not expire.

## Decision Rules

1. **User asks for an image.** Trigger immediately. Do not ask whether to use AI.
2. **Ambiguous request** ("make this look better", "improve the visuals"). Ask the
   user to clarify the target asset and style before generating.
3. **No API key.** Tell the user to set `MINIMAX_API_KEY` in their environment. Do
   not proceed without it.
4. **API error.** Surface `base_resp.status_code` and `status_msg`. The common ones:
   - `2013 invalid params` — wrong or unsupported model name, or a parameter the
     model does not accept. The user may have requested `image-01-live` or a
     `style` field; both are unsupported here.
   - `401` / `403` — key is missing, wrong, or revoked.
   - `429` — rate limited. Retry after a delay.
5. **Empty result.** If `data.image_urls` is empty or `success_count` is 0, the
   generation failed silently. Report the failure to the user; do not invent a URL.
6. **Verify before claiming success.** After the call, confirm `image_urls[0]` is
   a non-empty string before showing it to the user. A successful HTTP response
   with empty data is still a failure.

## Fallback

If MiniMax image generation is unavailable:
1. Point the user to the [MiniMax platform](https://platform.minimax.io) to run
   the same prompt manually.
2. Offer to save the prompt to a file (for example `prompts/logo-attempt-1.md`)
   so the user can re-run it later.
3. Do not switch to a different image generation service without explicit user
   approval.

## Related (not this skill)

- **Video generation** uses a different endpoint (`POST /v1/video_generation`)
  with models like `MiniMax-Hailuo-2.3` or `S2V-01`. Do not route video requests
  through this skill.
- **SVG / vector logos** that need to be hand-edited are usually better produced
  with a code-generation step, not image generation.
