const { ethers } = require("ethers");
const fs = require("fs");
const readline = require("readline");
const chalk = require("chalk").default; // Add chalk for text styling

// Tea Sepolia network configuration
const RPC_URL = "https://tea-sepolia.g.alchemy.com/public";
const TOKEN_CONTRACT_ADDRESS = "0xaC6719bcF3E276410D3aE0F6860B90f4bE6cbb53"; // Replace with the token contract address to be used for sending

// Minimal ERC-20 ABI for transfer
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function name() public view returns (string)",
  "function balanceOf(address account) public view returns (uint256)",
];

// Initialize provider
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Function to mask wallet address
function maskAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Read addresses from a .txt file
const filePath = "address.txt"; // Updated file name
if (!fs.existsSync(filePath)) {
  console.error(`❌ File ${filePath} not found!`);
  process.exit(1);
}

const addresses = fs.readFileSync(filePath, "utf-8").split("\n").map(addr => addr.trim()).filter(addr => addr);
if (addresses.length === 0) {
  console.error("❌ File address.txt is empty!"); // Updated file name
  process.exit(1);
}

// Read private keys from private_keys.txt file
const tuyulFilePath = "private_keys.txt"; // Updated file name
if (!fs.existsSync(tuyulFilePath)) {
  console.error(`❌ File ${tuyulFilePath} not found!`);
  process.exit(1);
}

const privateKeys = fs.readFileSync(tuyulFilePath, "utf-8").split("\n").map(key => key.trim()).filter(key => key);
if (privateKeys.length === 0) {
  console.error("❌ File private_keys.txt is empty!"); // Updated file name
  process.exit(1);
}

// Validate private keys and addresses
function validatePrivateKey(privateKey) {
  if (!ethers.isHexString(privateKey) || privateKey.length !== 66) {
    throw new Error("Invalid private key format.");
  }
}

function validateAddress(address) {
  if (!ethers.isAddress(address)) {
    throw new Error("Invalid Ethereum address.");
  }
}

// Securely load private keys and addresses
try {
  privateKeys.forEach(validatePrivateKey);
  addresses.forEach(validateAddress);
} catch (error) {
  console.error(`❌ Security validation failed: ${error.message}`);
  process.exit(1);
}

// Function to delay execution
function delay(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// Function to check balances based on private key
async function checkBalancesByPrivateKey(privateKey) {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const walletAddress = wallet.address;

    // Mask wallet address
    const maskedAddress = maskAddress(walletAddress);

    // Check native token balance
    const nativeBalance = await provider.getBalance(walletAddress);
    console.log(`💰 [${maskedAddress}] TEA token balance: ${ethers.formatEther(nativeBalance)}`);

    // Check contract token balance
    const tokenContract = new ethers.Contract(TOKEN_CONTRACT_ADDRESS, ERC20_ABI, provider);
    const tokenBalance = await tokenContract.balanceOf(walletAddress);

    // Detect token name
    let tokenName = "Token";
    try {
      tokenName = await tokenContract.name();
    } catch (error) {
      console.warn(`⚠️ Unable to detect token name for contract ${TOKEN_CONTRACT_ADDRESS}`);
    }

    console.log(`💰 [${maskedAddress}] ${tokenName} balance: ${ethers.formatUnits(tokenBalance, 18)}`);
  } catch (error) {
    console.error(`❌ Failed to check balance for private key: ${privateKey}. Error: ${error.message}`);
  }
}

// Call function for each private key
async function checkAllBalances() {
  console.log("🔍 Checking balances for all wallets...");
  for (const privateKey of privateKeys) {
    await checkBalancesByPrivateKey(privateKey);
  }
}

// Function to send tokens from multiple wallets
async function sendTokensFromMultipleWallets(numTransactions, delayPerTx, tokenAmount, useNativeToken) {
  if (numTransactions <= 0 || delayPerTx < 0 || tokenAmount <= 0) {
    console.error("❌ Invalid input values for transactions, delay, or token amount.");
    return;
  }

  const amountToSend = ethers.parseUnits(tokenAmount.toString(), 18); // Convert to wei
  const maxRetries = 3; // Maximum retry attempts
  const totalAddresses = addresses.length;

  if (totalAddresses === 0) {
    console.error("❌ No valid addresses in address.txt!");
    return;
  }

  console.log(`📋 Total available addresses: ${totalAddresses}`);
  console.log(`📋 Total available wallets: ${privateKeys.length}`);
  console.log(`📋 Transactions per wallet: ${numTransactions}`);
  console.log(`📋 Using ${useNativeToken ? "TEA token" : "Custom Token"} for transactions.`);

  let sentCount = 0; // Total successful transactions
  let failedCount = 0; // Total failed transactions
  let currentAddressIndex = 0; // Current address index

  for (let currentWalletIndex = 0; currentWalletIndex < privateKeys.length; currentWalletIndex++) {
    const privateKey = privateKeys[currentWalletIndex];

    try {
      validatePrivateKey(privateKey); // Validate private key before use
    } catch (error) {
      console.error(`❌ Invalid private key for wallet ${currentWalletIndex + 1}: ${error.message}`);
      continue;
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const maskedWalletAddress = maskAddress(wallet.address);

    console.log(`🔑 Using wallet ${currentWalletIndex + 1} (${maskedWalletAddress})`);

    let walletSentCount = 0; // Transactions sent by this wallet
    let lastUsedNonce = await provider.getTransactionCount(wallet.address, "latest"); // Track last used nonce

    while (walletSentCount < numTransactions) {
      const recipient = addresses[currentAddressIndex];

      try {
        validateAddress(recipient); // Validate recipient address
      } catch (error) {
        console.error(`❌ Invalid recipient address: ${error.message}`);
        currentAddressIndex = (currentAddressIndex + 1) % totalAddresses; // Skip to the next address
        continue;
      }

      const maskedRecipient = maskAddress(recipient);

      currentAddressIndex = (currentAddressIndex + 1) % totalAddresses; // Rotate to the next address

      if (recipient.toLowerCase() === wallet.address.toLowerCase()) {
        console.log(`⚠️ [Wallet ${currentWalletIndex + 1}] Recipient address (${maskedRecipient}) is the same as sender address (${maskedWalletAddress}). Skipping...`);
        continue;
      }

      let success = false;
      let attempts = 0;

      while (!success && attempts < maxRetries) {
        try {
          attempts++;

          // Use the last used nonce
          const nonce = lastUsedNonce;

          // Get gas fee data
          const feeData = await provider.getFeeData();
          let adjustedGasPrice = feeData.gasPrice * 110n / 100n; // Add 10% to gas price (use BigInt)

          // If REPLACEMENT_UNDERPRICED error occurs, increase gas price
          if (attempts > 1) {
            adjustedGasPrice = adjustedGasPrice * 120n / 100n; // Add 20% more for each retry
          }

          if (useNativeToken) {
            // Send native token with adjusted nonce and gas price
            const tx = await wallet.sendTransaction({
              to: recipient,
              value: amountToSend,
              nonce: nonce, // Use the last used nonce
              gasPrice: adjustedGasPrice, // Use adjusted gas price
            });
            success = true;
            console.log(chalk.green(`✅ [Wallet ${currentWalletIndex + 1}] Transaction successfully sent to ${maskedRecipient}: ${tx.hash}`));
          } else {
            // Send custom token with adjusted nonce and gas price
            const tokenContractWithWallet = new ethers.Contract(TOKEN_CONTRACT_ADDRESS, ERC20_ABI, wallet);
            const tx = await tokenContractWithWallet.transfer(recipient, amountToSend, {
              nonce: nonce, // Use the last used nonce
              gasPrice: adjustedGasPrice, // Use adjusted gas price
            });
            success = true;
            console.log(chalk.green(`✅ [Wallet ${currentWalletIndex + 1}] Token transaction successfully sent to ${maskedRecipient}: ${tx.hash}`));
          }

          sentCount++; // Increment global successful transaction count
          walletSentCount++; // Increment wallet-specific transaction count
        } catch (error) {
          failedCount++; // Increment failed transaction count
          console.error(chalk.red(`❌ [Wallet ${currentWalletIndex + 1}] Failed to send to ${maskedRecipient} on attempt ${attempts}: ${error.message}`));
          if (error.code === "REPLACEMENT_UNDERPRICED") {
            console.log("⚠️ Replacement transaction has too low a fee. Increasing gas price...");
          }
          if (error.code === "NONCE_EXPIRED") {
            console.log("⚠️ Nonce too low. Updating nonce...");
          }
          if (attempts >= maxRetries) {
            console.error(`❌ [Wallet ${currentWalletIndex + 1}] Permanently failed to send to ${maskedRecipient} after ${maxRetries} attempts.`);
          }
        } finally {
          // Update the last used nonce regardless of success or failure
          lastUsedNonce++;
        }
      }

      if (success) {
        // Countdown before the next transaction
        console.log(chalk.yellow(`⏳ Waiting ${delayPerTx} seconds before the next transaction...`));
        for (let countdown = delayPerTx; countdown > 0; countdown--) {
          process.stdout.write(chalk.cyan(`⏳ ${countdown} seconds remaining...\r`));
          await delay(1); // Wait 1 second
        }
        console.log(""); // Add a new line after the countdown
      }

      // If the requested global transaction count is reached, exit the wallet loop
      if (sentCount >= numTransactions * privateKeys.length) {
        console.log(`✅ All wallets have completed their transactions.`);
        console.log(`✅ Total successful transactions: ${sentCount}`);
        console.log(`❌ Total failed transactions: ${failedCount}`);
        return;
      }
    }

    console.log(`✅ Wallet ${currentWalletIndex + 1} (${maskedWalletAddress}) completed sending ${walletSentCount} transactions.`);
  }

  console.log(`✅ All transactions completed! Total successful transactions: ${sentCount}`);
  console.log(`❌ Total failed transactions: ${failedCount}`);
}

// Function to display menu
function showMenu() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.yellow(`YANG PAKE INI GAY - YANG PAKE INI GAY - YANG PAKE INI GAY `));
  console.log(`📋 Total wallets: ${privateKeys.length}`);
  console.log(`📋 Total addresses: ${addresses.length}`);
  console.log(`📋 Detected contract address: ${TOKEN_CONTRACT_ADDRESS}`);

  console.log("\n=== Main Menu ===");
  console.log("1. Check balances for all wallets");
  console.log("2. Send tokens");
  console.log("3. Exit");

  rl.question("Choose an option (1-3): ", (choice) => {
    console.clear(); // Clear the console for better readability

    switch (choice.trim()) {
      case "1":
        console.log("🔍 Checking balances for all wallets...");
        checkAllBalances().then(() => {
          console.log("✅ Balance check completed.");
          rl.close();
          showMenu(); // Return to the main menu
        });
        break;

      case "2":
        rl.question("Do you want to use TEA token? (y/n): ", (input0) => {
          const useNativeToken = input0.trim().toLowerCase() === "y";

          rl.question("How many transactions do you want to send? ", (input1) => {
            const numTransactions = parseInt(input1);
            if (isNaN(numTransactions) || numTransactions <= 0) {
              console.log("❌ Enter a valid number!");
              rl.close();
              return;
            }

            rl.question("How many seconds delay per Tx? (5 seconds is safe): ", (input2) => {
              const delayPerTx = parseInt(input2);
              if (isNaN(delayPerTx) || delayPerTx < 0) {
                console.log("❌ Enter a valid number!");
                rl.close();
                return;
              }

              rl.question("How many tokens do you want to send per transaction? ", (input3) => {
                const tokenAmount = parseFloat(input3);
                if (isNaN(tokenAmount) || tokenAmount <= 0) {
                  console.log("❌ Enter a valid number!");
                  rl.close();
                  return;
                }

                console.log(`🚀 Sending ${numTransactions} transactions with ${tokenAmount} ${useNativeToken ? "native token" : "custom token"} per transaction and a delay of ${delayPerTx} seconds using multiple wallets...`);

                sendTokensFromMultipleWallets(numTransactions, delayPerTx, tokenAmount, useNativeToken).then(() => {
                  console.log("✅ Transactions completed. Return to Main Menu");
                  rl.close();
                  showMenu(); // Return to the main menu
                });
              });
            });
          });
        });
        break;

      case "3":
        console.log("👋 Exiting...");
        rl.close();
        process.exit(0);
        break;

      default:
        console.log("❌ Invalid choice! Please select a valid option.");
        rl.close();
        showMenu(); // Return to the main menu
        break;
    }
  });
}

// Global error handling
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error.message);
});

// Run the menu
showMenu();
