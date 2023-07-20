const { exec } = require("child_process");
const path = require("path");

const Client = require("ssh2-sftp-client");
const SSH2Client = require("ssh2").Client;

const dotenv = require("dotenv");

if (process.env.NODE_ENV === "development") {
	dotenv.config({ path: path.join(__dirname, "/.env.dev") });
} else if (process.env.NODE_ENV === "production") {
	dotenv.config({ path: path.join(__dirname, "/.env.prd") });
} else {
	dotenv.config({ path: path.join(__dirname, "/.env.dev") });
}

const HOST = process.env.SSH_HOST;
const PORT = process.env.SSH_PORT;
const USERNAME = process.env.SSH_USERNAME;
const PASSWORD = process.env.SSH_PASSWORD;
const HOME_DIR = process.env.HOME_DIR;
const NODE_VERSION = process.env.NODE_VERSION;

const sshConfig = {
	host: HOST,
	port: PORT,
	username: USERNAME,
	password: PASSWORD,
};

const executeCommand = (command) => {
	return new Promise((resolve, reject) => {
		exec(command, (error, stdout) => {
			if (error) {
				reject(`Error executing command: ${error}`);
				return;
			}
			resolve(stdout);
		});
	});
};

const validateDevelopBranch = async () => {
	try {
		const result = await executeCommand("git branch --show-current");
		if (result.includes("develop")) return true;
		return false;
	} catch (error) {
		throw error;
	}
};

const build = async () => {
	try {
		await executeCommand("yarn build:dev");
		console.log("build complete");
	} catch (error) {
		throw error;
	}
};

const deleteServer = async () => {
	try {
		let commandList = [`rm -rf ${HOME_DIR}/`];
		await openShellSession(sshConfig, commandList);
		console.log("delete server file");
	} catch (error) {
		throw error;
	}
};

const upload = async () => {
	const sftp = new Client();

	await sftp.connect(sshConfig);

	try {
		const srcDir = path.join(__dirname, "dist");
		console.log("source directory : ", srcDir);

		const desDir = `${HOME_DIR}/`;
		console.log("destination directory : ", desDir);

		await sftp.uploadDir(srcDir, desDir);
		console.log("complete upload dist directory");

		sftp.end();
	} catch (error) {
		sftp.end();
		throw error;
	}
};

const openShellSession = (sshConfig, commandList) => {
	return new Promise((resolve, reject) => {
		const conn = new SSH2Client();

		conn
			.on("ready", () => {
				console.log("SSH connection established.");

				conn.shell((err, stream) => {
					if (err) {
						console.error(err);
						reject(err);
						return;
					}

					let receivedData = "";

					stream
						.on("close", () => {
							console.log("SSH shell session closed.");
							conn.end();
							resolve(receivedData);
						})
						.on("data", (data) => {
							receivedData += data.toString();
						});

					// Send commands to the shell session
					for (let idx = 0; idx < commandList.length; idx++) {
						stream.write(`${commandList[idx]}\r\n`);
					}
					stream.write("exit\n");
				});
			})
			.connect(sshConfig);

		conn.on("error", (err) => {
			console.error(err);
			reject(err);
		});
	});
};

const executeServer = async () => {
	try {
		const commandList = [
			`echo ${PASSWORD} | sudo -S systemctl restart apache2`,
		];
		await openShellSession(sshConfig, commandList);
		console.log("complete excute server");
	} catch (error) {
		throw error;
	}
};

const main = async () => {
	try {
		const isCheckDevelopBranch = await validateDevelopBranch();

		if (!isCheckDevelopBranch) {
			console.log("check your branch!!!!");
			process.exit();
		}

		await build();
		await deleteServer();
		await upload();
		await executeServer();
	} catch (error) {
		console.error(error);
	}
};

main();
