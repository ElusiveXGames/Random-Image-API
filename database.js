const { Sequelize, DataTypes } = require("sequelize");
const { customAlphabet } = require("nanoid");
const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 12);

const sequelize = new Sequelize("mysql://elusiveapi:lReEsXb79BGm3gOn@localhost:3306/elusiveapi", {
	logging: false,
});

const Endpoint = sequelize.define("endpoint", {
	id: {
		type: DataTypes.STRING,
		allowNull: false,
		primaryKey: true,
		defaultValue: () => nanoid(),
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
});

const Image = sequelize.define("image", {
	id: {
		type: DataTypes.STRING,
		allowNull: false,
		primaryKey: true,
		defaultValue: () => nanoid(),
	},
	filename: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	source: {
		type: DataTypes.STRING,
	},
	artistName: {
		type: DataTypes.STRING,
	},
	artistLink: {
		type: DataTypes.STRING,
	},
});

const User = sequelize.define("user", {
	id: {
		type: DataTypes.STRING,
		allowNull: false,
		primaryKey: true,
		defaultValue: () => nanoid(),
	},
	username: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	password: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	role: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 0,
	},
});

const Session = sequelize.define("session", {
	id: {
		type: DataTypes.STRING,
		allowNull: false,
		primaryKey: true,
		defaultValue: () => nanoid(),
	},
	accessToken: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	refreshToken: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	exp: {
		type: DataTypes.INTEGER,
	},
});

Endpoint.hasMany(Image);
Image.belongsTo(Endpoint);

User.hasOne(Session);
Session.belongsTo(User);

sequelize.sync({ alter: true }).then(() => {
	console.log("Database synced.");
});

module.exports = {
	Endpoint,
	Image,
	User,
	Session,
};
