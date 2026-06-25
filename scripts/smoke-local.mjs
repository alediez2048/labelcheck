const body = {
  applicationId: "smoke-local-001",
  beverageType: "distilled_spirits",
  form: {
    brandName: "TEST",
    classType: "BOURBON",
    alcoholContent: "40%",
    netContents: "750 ML",
    producerName: "TEST CO",
    producerAddress: "1 TEST ST",
  },
  faces: [{ kind: "front", bytes: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=", mime: "image/png" }],
};
const res = await fetch("http://localhost:3000/api/verify", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
console.log("STATUS:", res.status);
const text = await res.text();
console.log("BODY:", text.slice(0, 1500));
