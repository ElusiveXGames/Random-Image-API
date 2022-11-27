const { User } = require("./database");
const bcrypt = require("bcrypt");

setTimeout(async () => {
	const existingUser = await User.findOne({ where: { username: "admin" } });
	if (existingUser) {
		console.error("Error: Admin user already exists.");
		return process.exit(0);
	}
	const hash = await bcrypt.hash("admin", 10);
	const user = await User.create({
		username: "admin",
		password: hash,
	});
	console.log(
		`Created admin user with id ${user.id}\nUsername: admin\nPassword: admin\nRemember to create another user with a strong password and delete this one.`
	);
	process.exit(0);
}, 1000);
