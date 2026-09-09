import { Client, handle_file } from "@gradio/client";

const cases = [
  {
    name: "Z Image Turbo",
    space: "mrfakename/Z-Image-Turbo",
    endpoint: "/generate_image",
    inputs: ["A photorealistic Egyptian desert landscape at golden hour, cinematic, ultra detailed", 576, 1024, 8, 12345, true],
    kind: "image",
  },
  {
    name: "FLUX.1 Schnell",
    space: "black-forest-labs/FLUX.1-schnell",
    endpoint: "/infer",
    inputs: ["A photorealistic portrait of a young man in Cairo at night, cinematic street photography, natural skin texture", 12345, true, 768, 1024, 4],
    kind: "image",
  },
  {
    name: "Wan 2.2 14B Fast",
    space: "zerogpu-aoti/wan2-2-fp8da-aoti-faster",
    endpoint: "/generate_video",
    inputs: [
      handle_file("https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster/resolve/main/wan_i2v_input.JPG"),
      "The subject moves naturally with subtle cinematic camera motion, realistic lighting and smooth motion",
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
    name: "LTX Video",
    space: "Lightricks/ltx-video-distilled",
    endpoint: "/text_to_video",
    inputs: [
      "A cinematic realistic city street at night after rain, reflections on the road, people walking naturally, smooth camera movement",
      "worst quality, inconsistent motion, blurry, jittery, distorted, watermark, text, logo",
      null,
      null,
      512,
      704,
      "text-to-video",
      1.0,
      9,
      12345,
      true,
      1,
      false,
    ],
    kind: "video",
  },
];

function findUrl(value) {
  if (typeof value === "string" && /^(https?:\/\/|\/)/.test(value)) return value;
  if (Array.isArray(value)) for (const v of value) { const u = findUrl(v); if (u) return u; }
  if (value && typeof value === "object") {
    for (const key of ["url", "path"]) { const v = value[key]; const u = typeof v === "string" ? v : findUrl(v); if (u) return u; }
    for (const v of Object.values(value)) { const u = findUrl(v); if (u) return u; }
  }
}

for (const test of cases) {
  console.log(`\n=== ${test.name} ===`);
  const started = Date.now();
  try {
    const client = await Client.connect(test.space);
    const api = await client.view_api();
    console.log("API endpoint present:", Boolean(api.named_endpoints?.[test.endpoint]));
    if (!api.named_endpoints?.[test.endpoint]) {
      console.log(JSON.stringify(api, null, 2));
      throw new Error(`Missing endpoint ${test.endpoint}`);
    }
    const result = await client.predict(test.endpoint, test.inputs);
    const url = findUrl(result?.data);
    if (!url) throw new Error(`Prediction returned no file URL: ${JSON.stringify(result?.data)}`);
    console.log(`PASS ${test.kind}: ${url}`);
    console.log(`elapsed_ms=${Date.now() - started}`);
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("\nALL SMOKE TESTS PASSED");
