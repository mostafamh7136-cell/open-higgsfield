import { Client, handle_file } from "@gradio/client";

const requested = process.env.MODEL ?? "all";
const promptImage = "A photorealistic Egyptian desert landscape at golden hour, cinematic photography, natural light, ultra detailed";
const promptVideo = "A cinematic realistic city street at night after rain, reflections on the road, people walking naturally, smooth camera movement, photorealistic";

const cases = [
  {
    id: "zimage", name: "Z Image Turbo", space: "mrfakename/Z-Image-Turbo", endpoint: "/generate_image",
    buildInputs: () => [promptImage, 576, 1024, 8, 12345, true], kind: "image",
  },
  {
    id: "flux", name: "FLUX.1 Schnell", space: "black-forest-labs/FLUX.1-schnell", endpoint: "/infer",
    buildInputs: () => ["A photorealistic portrait of a young Egyptian man in Cairo at night, cinematic street photography, natural skin texture", 12345, true, 1024, 576, 4], kind: "image",
  },
  {
    id: "wan14b", name: "Wan 2.2 14B Fast", space: "zerogpu-aoti/wan2-2-fp8da-aoti-faster", endpoint: "/generate_video",
    buildInputs: () => [handle_file("https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster/resolve/main/wan_i2v_input.JPG"), promptVideo, 4, "worst quality, blurry, watermark, jittery, distorted, deformed", 4, 1, 1, 12345, true], kind: "video",
  },
  {
    id: "wan5b", name: "Wan 2.2 5B · app-contract", space: "pragya2-7/wan-2-2-5b-video", endpoint: "/generate_video",
    buildInputs: () => [null, promptVideo, 576, 1024, "Bright tones, overexposed, static, blurred details, subtitles, worst quality, low quality, watermark, text, signature", 2, 4, 6, 12345, true], kind: "video",
  },
  {
    id: "ltx", name: "LTX Video · app-contract", space: "Lightricks/ltx-video-distilled", endpoint: "/text_to_video",
    buildInputs: () => [promptVideo, "worst quality, inconsistent motion, blurry, jittery, distorted, watermark, text, logo", null, null, 576, 1024, "text-to-video", 2, 9, 12345, true, 3, false], kind: "video",
  },
].filter((test) => requested === "all" || test.id === requested);

function absoluteUrl(value, space) {
  if (typeof value !== "string") return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) {
    const [owner, name] = space.split("/");
    return new URL(value, `https://${owner}-${name}.hf.space`).toString();
  }
}
function findUrl(value, space) {
  const direct = absoluteUrl(value, space);
  if (direct) return direct;
  if (Array.isArray(value)) for (const item of value) { const u = findUrl(item, space); if (u) return u; }
  if (value && typeof value === "object") {
    for (const key of ["url", "path"]) { const u = findUrl(value[key], space); if (u) return u; }
    for (const item of Object.values(value)) { const u = findUrl(item, space); if (u) return u; }
  }
}
function redactInputs(inputs) {
  return inputs.map((input, index) => {
    if (input === null || input === undefined) return { index, kind: "null" };
    if (typeof input === "string") return { index, kind: "string", preview: input.length > 120 ? `${input.slice(0, 120)}…` : input };
    if (typeof input === "number" || typeof input === "boolean") return { index, kind: typeof input, value: input };
    return { index, kind: "file/object", keys: Object.keys(input).slice(0, 15) };
  });
}

for (const test of cases) {
  console.log(`=== ${test.name} (${test.id}) ===`);
  const started = Date.now();
  try {
    const client = await Client.connect(test.space);
    const api = await client.view_api();
    const endpoint = api.named_endpoints?.[test.endpoint];
    if (!endpoint) throw new Error(`Missing endpoint ${test.endpoint}. Available: ${Object.keys(api.named_endpoints ?? {}).join(", ") || "none"}`);
    console.log(`endpoint=${test.endpoint}`);
    console.log(`schema=${JSON.stringify(endpoint)}`);
    const inputs = test.buildInputs();
    console.log(`inputs=${JSON.stringify(redactInputs(inputs))}`);
    const result = await client.predict(test.endpoint, inputs);
    console.log(`raw_result=${JSON.stringify(result?.data)}`);
    const url = findUrl(result?.data, test.space);
    if (!url) throw new Error("Prediction returned no file URL.");
    const response = await fetch(url);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) throw new Error(`Generated file fetch failed (${response.status}).`);
    if (bytes.length <= 1024) throw new Error(`Generated file too small (${bytes.length} bytes).`);
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
console.log("ALL REQUESTED APP-CONTRACT SMOKE TESTS PASSED");
