export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify({ disabled: true }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
