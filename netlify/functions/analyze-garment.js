exports.handler = async function(event) {
  try {
    const { imageDataUrl } = JSON.parse(event.body);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Function läuft 🎉",
        received: !!imageDataUrl
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
