const { getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  // We use the "orders" store to keep track of locked validations
  const store = getStore("orders");
  const method = event.httpMethod;

  // --- SAVE ORDER (Step 1) ---
  if (method === "POST") {
    try {
      const data = JSON.parse(event.body);
      
      // Validation: Ensure Order ID exists
      if (!data.orderId) {
        return { statusCode: 400, body: "Missing Order ID" };
      }

      // Save to Netlify Blobs
      await store.set(data.orderId, JSON.stringify(data));

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Order Saved Successfully", id: data.orderId }),
      };
    } catch (error) {
      console.error(error);
      return { statusCode: 500, body: "Server Error: Could not save order." };
    }
  } 
  
  // --- FETCH ORDER (Step 2) ---
  else if (method === "GET") {
    try {
      const orderId = event.queryStringParameters.id;
      
      if (!orderId) {
        return { statusCode: 400, body: "Missing Order ID parameter" };
      }

      const data = await store.get(orderId);

      if (!data) {
        return { statusCode: 404, body: "Order not found" };
      }

      return {
        statusCode: 200,
        body: data, // Returns the saved JSON
      };
    } catch (error) {
      console.error(error);
      return { statusCode: 500, body: "Server Error: Could not fetch order." };
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
