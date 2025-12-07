const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.SRTIPE_SECRET_KEY);
const port = process.env.PORT || 3000;
const crypto = require("crypto");

// MiddleWare
app.use(express.json());
app.use(cors());

const generateTrackingId = () => {
  const prefix = "PRCL";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `${prefix}-${date}-${random}`;
};

const verifyFBToken = (req, res, next) => {
  console.log("headers:", req.headers.authorization);
  next();
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
    await client.connect();
    const db = client.db("GarmentsPro");
    const userCollection = db.collection("users");
    const productsCollection = db.collection("products");
    const ordersCollection = db.collection("orders");

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
      const result = await productsCollection.find().toArray();
      res.send(result);
    });

    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // manager middlewere করতে হবে***********
    app.post("/products", async (req, res) => {
      const productInfo = req.body;
      productInfo.createdAt = new Date().toLocaleString()
      const result = await productsCollection.insertOne(productInfo);
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
          quantity: paymentInfo?.orderQuantity
        },
        success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_DOMAIN}/productDetails/${paymentInfo?.id}`,
      });

      res.send({url: session.url})
    });



    app.post('/payment-success', async(req, res)=> {
      const {sessionId} = req.body
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const product = await productsCollection.findOne({_id: new ObjectId(session.metadata.productId)})

      const order = await ordersCollection.findOne({transectionId:session.payment_intent})

      if(session.status === 'complete' && product && !order){
        const orderInfo = {
          productId: session.metadata.productId,
          transectionId: session.payment_intent,
          customer: session.metadata.customerName,
          status: "Panding",
          customerAddress: session.metadata.customerAddress,
          quantity: session.metadata.quantity,
          seller: product.sellerName,
          price: session.amount_total / 100
        }
        const result = await ordersCollection.insertOne(orderInfo)

        await productsCollection.updateOne(
          {_id: new ObjectId(session.metadata.productId),},
          {
            $inc: {availableQuantity: -1}
          }
        )
        return res.send({
          transectionId: session.payment_intent,
          orderId: order._id
        })
      }
      res.send(result)
    })

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
