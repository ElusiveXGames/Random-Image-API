const { version } = require("./package.json");
const { Endpoint, Image, User, Session } = require("./database");
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const config = require("./config");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { nanoid } = require("nanoid");
const ms = require("ms");
const app = express();

const HOST_URL = `http://localhost:1010`;

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
	res.json({
		ok: true,
		message: `Random image API v${version}`,
		endpoints: [{ method: "GET", path: "/:endpoint", description: "Get a random image from an endpoint" }],
	});
});

app.get("/:endpoint", async (req, res) => {
	try {
		const { endpoint: endpointName } = req.params;
		const endpoint = await Endpoint.findOne({ where: { name: endpointName } });
		if (!endpoint) {
			return res.status(404).json({ ok: false, message: "Invalid image endpoint." });
		}
		const images = await endpoint.getImages();
		if (!images.length) {
			return res.status(404).json({ ok: false, message: "No images found for this endpoint." });
		}
		const randomImage = images[Math.floor(Math.random() * images.length)];
		const url = `${HOST_URL}/images/${randomImage.id}`;
		res.json({
			ok: true,
			image: {
				id: randomImage.id,
				url: url,
				source: randomImage.source,
				artistName: randomImage.artistName,
				artistLink: randomImage.artistLink,
				createdAt: randomImage.createdAt,
				updatedAt: randomImage.updatedAt,
			},
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An error occurred while getting the endpoint.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

app.get("/images/:id", async (req, res) => {
	try {
		const { id } = req.params;
		const image = await Image.findOne({ where: { id } });
		if (!image) {
			return res.status(404).json({ ok: false, message: "Invalid image." });
		}
		// check if file exists
		const filepath = `./images/${image.filename}`;
		if (!fs.existsSync(filepath)) {
			return res.status(404).json({ ok: false, message: "Image not found." });
		}
		res.sendFile(image.filename, { root: "./images" });
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An error occurred while getting the image.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/*
  Client Routes (for the web panel)
 */

/* Authorization middleware */
const auth = async (req, res, next) => {
	if (!req.headers.authorization) {
		return res.status(401).json({ ok: false, message: "Missing authorization header. Please refresh." });
	}
	const [type, token] = req.headers.authorization.split(" ");
	if (type !== "Bearer") {
		return res.status(401).json({ ok: false, message: "Invalid authorization header. Please refresh." });
	}
	const session = await Session.findOne({ where: { accessToken: token } });
	if (!session) {
		return res.status(401).json({ ok: false, message: "Invalid authorization header. Please refresh." });
	}
	const user = await session.getUser();
	if (!user) {
		return res.status(401).json({ ok: false, message: "Invalid authorization header. Please refresh." });
	}
	req.user = {
		id: user.id,
		username: user.username,
		role: user.role,
	};
	return next();
};

/* GET user authenticated */
app.get("/client/me", auth, async (req, res) => {
	try {
		res.json({
			ok: true,
			message: "User data successfully gathered.",
			user: req.user,
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An internal error occurred while logging in.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* POST authenticate and create session */
app.post("/client/login", async (req, res) => {
	try {
		const { username, password } = req.body;
		if (!username || !password) {
			return res.status(400).json({ ok: false, message: "Username or password are missing." });
		}
		const user = await User.findOne({ where: { username } });
		if (!user) {
			return res.status(401).json({ ok: false, message: "Invalid credentials." });
		}
		const isValid = await bcrypt.compare(password, user.password);
		if (!isValid) {
			return res.status(401).json({ ok: false, message: "Invalid credentials." });
		}
		const at = nanoid(25);
		const rt = nanoid(25);
		const session = await user.createSession({
			accessToken: at,
			refreshToken: rt,
			exp: isNaN(ms(config.session.expiresIn)) ? config.session.expiresIn : ms(config.session.expiresIn),
		});
		res.json({
			ok: true,
			message: "Log in successful.",
			accessToken: session.accessToken,
			refreshToken: session.refreshToken,
			exp: session.exp,
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An internal error occurred while logging in.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* POST create user */
app.post("/client/users", auth, async (req, res) => {
	try {
		const { username, password, role } = req.body;
		if (!username || !password) {
			return res.status(400).json({ ok: false, message: "Username or password are missing." });
		}
		const existingUser = await User.findOne({ where: { username } });
		if (existingUser) {
			return res.status(400).json({ ok: false, message: "This user already exists." });
		}
		const hash = await bcrypt.hash(password, 10);
		const user = await User.create({
			username,
			password: hash,
			role,
		});
		res.json({
			ok: true,
			message: "User successfully created.",
			user,
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An internal error occurred while creating the user.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* POST regenerate token */
app.post("/client/token", auth, async (req, res) => {
	try {
		const { refreshToken } = req.body;
		if (!refreshToken) {
			return res.status(400).json({ ok: false, message: "Refresh token is missing." });
		}
		const session = await Session.findOne({ where: { refreshToken } });
		if (!session) {
			return res.status(400).json({ ok: false, message: "Invalid refresh token." });
		}
		session.accessToken = nanoid(25);
		session.exp = isNaN(ms(config.session.expiresIn)) ? config.session.expiresIn : ms(config.session.expiresIn);
		await session.save();
		res.json({
			ok: true,
			message: "Token successfully regenerated.",
			accessToken: session.accessToken,
			exp: session.exp,
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An internal error occurred while generating new token.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* GET all users */
app.get("/client/users", auth, async (req, res) => {
	try {
		const users = await User.findAll();
		res.json({
			ok: true,
			message: "Users successfully gathered.",
			users: users.map((user) => ({
				id: user.id,
				username: user.username,
			})),
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An internal error occurred while getting all users.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* DELETE user */
app.delete("/client/users/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		const user = await User.findOne({ where: { id } });
		if (!user) {
			return res.status(400).json({ ok: false, message: "User not found." });
		}
		await user.destroy();
		res.json({
			ok: true,
			message: "User successfully deleted.",
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An internal error occurred while deleting the user.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* GET all images in endpoint */
app.get("/client/images/:endpointId", auth, async (req, res) => {
	try {
		const { endpointId } = req.params;
		const endpoint = await Endpoint.findOne({ where: { id: endpointId } });
		if (!endpoint) {
			return res.status(404).json({ ok: false, message: "Invalid endpoint." });
		}
		const images = await endpoint.getImages();
		res.json({
			ok: true,
			images: images.map((image) => ({
				id: image.id,
				filename: image.filename,
				url: `${HOST_URL}/images/${image.id}`,
				createdAt: image.createdAt,
				updatedAt: image.updatedAt,
				source: image.source,
				artistName: image.artistName,
				artistLink: image.artistLink,
			})),
			endpoint: {
				id: endpoint.id,
				name: endpoint.name,
			},
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An error occurred while getting images for this endpoint.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* POST new images */
app.post("/client/images", auth, async (req, res) => {
	try {
		// Create image
		const { imageUrl, endpointId, source, artistName, artistLink } = req.body;
		if (!imageUrl || !endpointId) {
			return res.status(400).json({ ok: false, message: "Invalid image URL or endpoint." });
		}
		const endpoint = await Endpoint.findOne({ where: { id: endpointId } });
		if (!endpoint) {
			return res.status(404).json({ ok: false, message: "Invalid endpoint." });
		}
		const { data } = await axios.get(imageUrl, { responseType: "arraybuffer" });
		let extension = imageUrl.split(".").pop();
		if ([".jpg", ".jpeg", ".png", ".gif", ".avif", ".webp"].indexOf(extension) === -1) {
			extension = ".jpg";
		}
		const finalName = `${Date.now()}${extension}`;
		await Image.create({
			filename: finalName,
			endpointId: endpoint.id,
			source,
			artistName,
			artistLink,
		});
		const imagePath = `./images/${finalName}`;
		fs.writeFile(imagePath, data, (err) => {
			if (err) {
				console.log(err);
				res.status(500).json({
					ok: false,
					message: "An error occurred while writing the image.",
				});
			}
			res.json({
				ok: true,
			});
		});
	} catch (err) {
		console.log(err);
		return res.status(500).json({
			ok: false,
			message: "An error occurred while getting the image.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});
/* DELETE an image */
app.delete("/client/images/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		const image = await Image.findOne({ where: { id } });
		if (!image) {
			return res.status(404).json({ ok: false, message: "Invalid image." });
		}
		await image.destroy();
		res.json({
			ok: true,
			message: "Image successfully deleted.",
		});
	} catch (err) {
		console.log(err);
		return res.status(500).json({
			ok: false,
			message: "An error occurred while getting the image.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* GET all endpoints with images */
app.get("/client/endpoints", auth, async (req, res) => {
	try {
		const endpoints = await Endpoint.findAll({ include: Image });
		res.json({
			ok: true,
			endpoints: endpoints.map((endpoint) => ({
				id: endpoint.id,
				name: endpoint.name,
				createdAt: endpoint.createdAt,
				updatedAt: endpoint.updatedAt,
				images: endpoint.images,
			})),
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An error occurred while getting the image.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* POST an endpoint */
app.post("/client/endpoints", auth, async (req, res) => {
	try {
		const { name } = req.body;
		if (!name) {
			return res.status(400).json({ ok: false, message: "Invalid endpoint name." });
		}
		const existingEndpoint = await Endpoint.findOne({ where: { name } });
		if (existingEndpoint) {
			return res.status(400).json({ ok: false, message: "An endpoint with this name already exists." });
		}
		const endpoint = await Endpoint.create({ name });
		res.json({ ok: true, message: "Endpoint created.", endpoint });
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An error occurred while getting the image.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

/* DELETE an endpoint */
app.delete("/client/endpoints/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		const endpoint = await Endpoint.findOne({ where: { id } });
		if (!endpoint) {
			return res.status(404).json({ ok: false, message: "Invalid endpoint." });
		}
		await endpoint.destroy();
		res.json({ ok: true, message: "Endpoint deleted." });
	} catch (err) {
		return res.status(500).json({
			ok: false,
			message: "An error occurred while getting the image.",
			_errors: [{ name: err.name, messages: err.message }],
		});
	}
});

const PORT = process.env.PORT || config.port;

app.listen(PORT, () => {
	console.log(`API listening on http://localhost:${PORT}!`);
});
