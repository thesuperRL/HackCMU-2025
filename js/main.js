function sendToFlask(jsonData) {
  fetch("/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ account_json: jsonData }),
  })
    .then((response) => response.json())
    .then((data) => {
      document.getElementById("response").innerText = data.py_variable;
      console.log("Status:", data.status);
    });
}

function decodeJWT(token) {
  let base64Url = token.split(".")[1];
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  let jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
  return JSON.parse(jsonPayload);
}

function handleCredentialResponse(response) {
  console.log("Encoded JWT ID token: " + response.credential);

  const responsePayload = decodeJWT(response.credential);

  console.log("Decoded JWT ID token fields:");
  console.log("  Full Name: " + responsePayload.name);
  console.log("  Given Name: " + responsePayload.given_name);
  console.log("  Family Name: " + responsePayload.family_name);
  console.log("  Unique ID: " + responsePayload.sub);
  console.log("  Profile image URL: " + responsePayload.picture);
  console.log("  Email: " + responsePayload.email);

  sendLoginData(
    "",
    responsePayload.name,
    responsePayload.email,
    responsePayload.sub
  );
}
