### Clone and Setup

1. **Clone the Repository**

   First, clone the repository to your local machine:

   ```bash
   git clone https://github.com/ZayJII/Tea-auto-send-bot.git
   cd Tea-auto-send-bot
   ```

2. **Install Dependencies**

   Install all the required dependencies:

   ```bash
   npm install
   ```

3. **Setup the Wallet File**

   Edit a file called `address.txt` add as many wallet addresses as possible 

   Edit a file called `private_keys.txt` This file should contain the private keys for the wallets you want to use, one private key per line. Make sure to keep this file secure.

   config in tea.js
   
   RPC_URL = "https://tea-sepolia.g.alchemy.com/public";
   TOKEN_CONTRACT_ADDRESS = "0x000000000000000000000000000000"; // Replace with the token contract address to be used for sending


5. **Run the Script**

   After setup, you can start the script by running the following command:

   ```bash
   node tea.js
   ```

   The script will start processing wallets and executing functions in a loop. It will continuously run until transaction complete for all private keys.

### Notes & how to use
  1. Check Balance
  2. Send token
 
     -if you choose (Y) in the first question then you will use the tea token,
     
     -if you choose (N) in the first question then it will use a custom token in config tea.js
     
     -input how many time transaction you wan
     
     -input delay per transaction in second
     
     -input how much token you send example 0.00001
      
  
  If the address content in address.txt is less than the transaction amount, it will be sent to the existing address repeatedly until the request is met.



  This project is licensed under the MIT License
