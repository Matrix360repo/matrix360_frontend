/**
 * Read-only backend connectivity probe for the Matrix 360 frontend.
 * Does not connect Mayur and Tanmayi to each other or expose credentials.
 * Deploy as Vercel Function. Never send customer data or keys to this endpoint.
 */
const specs = [
  {id:"mayur",env:"MATRIX360_MAYUR_API_URL",health:"/healthz"},
  {id:"tanmayi",env:"MATRIX360_TANMAYI_API_URL",health:"/health"}
];
async function probe(spec) {
  const raw = process.env[spec.env];
  if (!raw) return {service:spec.id,state:"not_configured"};
  let url;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash)
      return {service:spec.id,state:"invalid_configuration"};
    url = new URL(spec.health, parsed.origin);
  } catch {
    return {service:spec.id,state:"invalid_configuration"};
  }
  try {
    const response=await fetch(url.toString(),{
      method:"GET",redirect:"error",cache:"no-store",
      signal:AbortSignal.timeout(3000),
      headers:{"Accept":"application/json"}
    });
    return {service:spec.id,state:response.ok?"reachable":"unavailable"};
  } catch {
    return {service:spec.id,state:"unavailable"};
  }
}
module.exports=async function handler(req,res) {
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="GET") return res.status(405).json({error:"method_not_allowed"});
  const services=await Promise.all(specs.map(probe));
  return res.status(200).json({
    mode:"read_only_probe",
    note:"Reachable is not equivalent to authenticated or production-ready.",
    services,
    integrationBetweenEnginesAuthorized:false
  });
};