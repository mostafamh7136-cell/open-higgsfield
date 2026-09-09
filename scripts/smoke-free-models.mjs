import { Client, handle_file } from "@gradio/client";

const requested = process.env.MODEL ?? "all";
const cases = [
  {
    id: "zimage",
    name: "Z Image Turbo",
    space: "mrfakename/Z-Image-Turbo",
    endpoint: "/generate_image",
    inputs: ["A photorealistic Egyptian desert landscape at golden hour, cinematic photography, natural light, ultra detailed", 576, 1024, 8, 12345, true],
    kind: "image",
  },
  {
    id: "flux",
    name: "FLUX.1 Schnell",
    space: "black-forest-labs/FLUX.1-schnell",
    endpoint: "/infer",
    inputs: ["A photorealistic portrait of a young Egyptian man in Cairo at night, cinematic street photography, natural skin texture", 12345, true, 768, 1024, 4],
    kind: "image",
  },
  {
    id: "wan14b",
    name: "Wan 2.2 14B Fast",
    space: "zerogpu-aoti/wan2-2-fp8da-aoti-faster",
    endpoint: "/generate_video",
    inputs: [
      handle_file("https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster/resolve/main/wan_i2v_input.JPG"),
      "The subject moves naturally with subtle cinematic camera motion, realistic lighting, detailed textures and smooth motion",
      4,
      "worst quality, blurry, watermark, jittery, distorted, deformed",
      0.8,
      1,
      1,
      12345,
      true,
    ],
    kind: "video",
  },
  {
    id: "wan5b",
    name: "Wan 2.2 5B",
    space: "pragya2-7/wan-2-2-5b-video",
    endpoint: "/generate_video",
    inputs: [
      null,
      "A cinematic realistic city street at night after rain, people walking naturally, realistic reflections, smooth camera movement",
      512,
      768,
      "Bright tones, overexposed, static, blurred details, subtitles, worst quality, low quality, watermark, text, signature",
      1,
      4,
      6,
      12345,
      true,
    ],
    kind: "video",
  },
  {
    id: "ltx",
    name: "LTX Video Fast",
    space: "Lightricks/ltx-video-distilled",
    endpoint: "/text_to_video",
    inputs: [
      "A cinematic realistic city street at night after rain, reflections on the road, people walking naturally, smooth camera movement, photorealistic",
      "worst quality, inconsistent motion, blurry, jittery, distorted, watermark, text, logo",
      null,
      null,
      512,
      704,
      "text-to-video",
      0.3,
      9,
      12345,
      true,
      3,
      false,
    ],
    kind: "video",
  },
].filter((test) => requested === "all" || test.id === requested);

function absoluteUrl(value, space) {
  if (typeof value !== "string") return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return new URL(value, `https://${space.replace("/", "-")}.hf.space`).toString();
}
function findUrl(value, space) {
  const direct = absoluteUrl(value, space);
  if (direct) return direct;
  if (Array.isArray(value)) for (const v of value) { const u = findUrl(v, space); if (u) return u; }
  if (value && typeof value === "object") {
    for (const key of ["url", "path"]) { const u = findUrl(value[key], space); if (u) return u; }
    for (const v of Object.values(value)) { const u = findUrl(v, space); if (u) return u; }
  }
}

for (const test of cases) {
  console.log(`=== ${test.name} (${test.id}) ===`);
  const started = Date.now();
  try {
    const client = await Client.connect(test.space);
    const api = await client.view_api();
    if (!api.named_endpoints?.[test.endpoint]) throw new Error(`Missing endpoint ${test.endpoint}`);
    console.log(`endpoint=${test.endpoint}`);
    const result = await client.predict(test.endpoint, test.inputs);
    const url = findUrl(result?.data, test.space);
    if (!url) throw new Error(`Prediction returned no file URL: ${JSON.stringify(result?.data)}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Generated file could not be fetched (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1024) throw new Error(`Generated file is unexpectedly small (${bytes.length} bytes).`);
    console.log(`PASS ${test.kind}: ${url}`);
    console.log(`artifact_bytes=${bytes.length}`);
    console.log(`content_type=${response.headers.get("content-type") || "unknown"}`);
    console.log(`elapsed_ms=${Date.now() - started}`);
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 1;
  }
}
if (cases.length === 0) throw new Error(`Unknown MODEL=${requested}`);
if (process.exitCode) process.exit(process.exitCode);
console.log("ALL REQUESTED SMOKE TESTS PASSED");
