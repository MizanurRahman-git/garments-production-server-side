const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.SRTIPE_SECRET_KEY);
const port = process.env.PORT || 3000;
const crypto = require("crypto");

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MiddleWare
app.use(
  cors({
    // origin: [process.env.CLIENT_DOMAIN],
    // credentials: true,
    // optionSuccessStatus: 200,
  })
);
app.use(express.json());

const generateTrackingId = () => {
  const prefix = "PRCL";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `${prefix}-${date}-${random}`;
};

const verifyFBToken = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@simple-crud-serv.sbd6kzc.mongodb.net/?appName=Simple-CRUD-Serv`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Garments-Production-Running....");
});

async function run() {
  try {
    const db = client.db("GarmentsPro");
    const userCollection = db.collection("users");
    const productsCollection = db.collection("products");
    const ordersCollection = db.collection("orders");

    // get user for admin
    app.get("/users", verifyFBToken, async (req, res) => {
      const adminEmail = req.tokenEmail;
      const result = await userCollection
        .find({ email: { $ne: adminEmail } })
        .toArray();
      res.send(result);
    });

    // get user role
    app.get("/user/role", verifyFBToken, async (req, res) => {
      const result = await userCollection.findOne({ email: req.tokenEmail });
      res.send({ role: result?.role });
    });

    // update user role
    app.patch("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const newRole = req.body.role;
      const updateInfo = {
        $set: {
          role: newRole,
        },
      };
      const result = await userCollection.updateOne(query, updateInfo);
      res.send(result);
    });

    // user
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.status = "Panding";
      user.createdAt = new Date().toLocaleString();
      const email = user.email;
      const emailExist = await userCollection.findOne({ email });
      if (emailExist) {
        return res.send({ message: "Email Already Exist. Please Log in " });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // Products
    app.get("/products", async (req, res) => {
      const { searchText, limit, skip } = req.query;
      
      const query = {};
      if (searchText) {
        query.productName = { $regex: searchText, $options: "i" };
      }

      const result = await productsCollection
        .find(query)
        .limit(Number(limit))
        .skip(Number(skip))
        .sort({ createdAt: -1 })
        .toArray();

      const count = await productsCollection.countDocuments();

      res.send({ result, total: count });
    });

    // get product for home page just 6 items
    app.get("/display-product", async (req, res) => {
      const result = await productsCollection
        .find()
        .sort({ createdAt: -1 })
        .limit(8)
        .toArray();
      res.send(result);
    });

    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.post("/products", async (req, res) => {
      const productInfo = req.body;
      productInfo.createdAt = new Date().toLocaleString();
      const result = await productsCollection.insertOne(productInfo);
      res.send(result);
    });

    // update product
    app.patch("/product/:id", async (req, res) => {
      const info = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const updateInfo = {
        $set: {
          productName: info.productName,
          productPrice: info.productPrice,
          category: info.category,
          availableQuantity: info.availableQuantity,
          description: info.description,
          image: info.image,
          minimumQuantity: info.minimumQuantity,
          paymentOptions: info.paymentOptions,
          videoLink: info.videoLink,
        },
      };
      const result = await productsCollection.updateOne(query, updateInfo);
      res.send(result);
    });

    // product delete
    app.delete("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    // Payment
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: paymentInfo?.productName,
              },
              unit_amount: paymentInfo?.productPrice * 100,
            },
            quantity: paymentInfo?.orderQuantity,
          },
        ],
        customer_email: paymentInfo?.email,
        mode: "payment",
        metadata: {
          productId: paymentInfo?.id,
          customerName: paymentInfo?.firstName,
          customerEmail: paymentInfo?.email,
          customerAddress: paymentInfo?.address,
          quantity: paymentInfo?.orderQuantity,
        },
        success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_DOMAIN}/productDetails/${paymentInfo?.id}`,
      });

      res.send({ url: session.url });
    });

    app.post("/payment-success", async (req, res) => {
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const product = await productsCollection.findOne({
        _id: new ObjectId(session.metadata.productId),
      });

      const order = await ordersCollection.findOne({
        transectionId: session.payment_intent,
      });

      if (session.status === "complete" && product && !order) {
        const orderInfo = {
          productName: product.productName,
          productId: session.metadata.productId,
          transectionId: session.payment_intent,
          customer: session.metadata.customerEmail,
          status: "Panding",
          trackingId: generateTrackingId(),
          customerAddress: session.metadata.customerAddress,
          quantity: session.metadata.quantity,
          managerEmail: product.managerEmail,
          seller: product.sellerName,
          price: session.amount_total / 100,
          createAt: new Date().toLocaleDateString(),
        };
        const result = await ordersCollection.insertOne(orderInfo);

        await productsCollection.updateOne(
          { _id: new ObjectId(session.metadata.productId) },
          {
            $inc: { availableQuantity: -1 },
          }
        );
        return res.send({
          transectionId: session.payment_intent,
          orderId: order._id,
        });
      }
      res.send(result);
    });

    // get orders for buyer
    app.get("/my-orders", verifyFBToken, async (req, res) => {
      const result = await ordersCollection
        .find({ customer: req.tokenEmail })
        .toArray();
      res.send(result);
    });

    // all orders for admin
    app.get("/all-orders", async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};
      if (searchText) {
        query.productName = { $regex: searchText, $options: "i" };
      }
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    // get single order
    app.get("/single-order/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ordersCollection.findOne(query);
      res.send(result);
    });

    // update order status
    app.patch("/update-order/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateInfo = {
        $set: {
          status: status,
        },
      };
      const result = await ordersCollection.updateOne(query, updateInfo);
      res.send(result);
    });

    // get orders for manager
    app.get("/manage-orders/:email", async (req, res) => {
      const email = req.params.email;
      const result = await ordersCollection
        .find({ managerEmail: email })
        .toArray();
      res.send(result);
    });

    // get products for manage
    app.get("/manage-product/:email", async (req, res) => {
      const email = req.params.email;
      const searchText = req.query.searchText;
      const query = { managerEmail: email };

      if (searchText) {
        query.productName = { $regex: searchText, $options: "i" };
      }

      const result = await productsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    // get panding product
    app.get("/panding-orders", async (req, res) => {
      const query = { status: "Panding" };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    // Approved orders
    app.get("/approved-orders", async (req, res) => {
      const query = { status: "Approved" };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
