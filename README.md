# CryptoGame

<img src="https://raw.githubusercontent.com/CreativeCactus/Cryptogame/master/cryptogame.gif" alt="cap" style="height:500px; width:800px; right: 0px; position:absolute;"></img>

<i>A 2D pixel world full of potential and easy-to-read json data files.</i>

This project is in early stages, to simply get up to speed you can clone and 

```
	sudo npm install -g node-gyp node-pre-gyp # if need be - required for bcrypt
	npm i
	node client.js
```

and navigate to http://127.0.0.1:8080/ where you will be informally prompted to log in.

*If you encounter* `bcrypt_lib.node: failed to map segment from shared object` and manage to solve this bug, solutions welcome. It seems related to versioning.

Upon logging in, if the account does not exist, the user will be directed to a signup page (work in progress).
The data files included have an account 'name', with password 'pass'. 

# Credits

Sprites are all by Sithjester

http://untamed.wild-refuge.net/rmxpresources.php?characters
