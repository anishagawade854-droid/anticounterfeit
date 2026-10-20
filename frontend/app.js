const CONTRACT_ADDRESS = "0x9171173ecC13f4B7B0F89D19DAc087529af3b0C3";
const SEPOLIA_CHAIN_ID = "0xaa36a7";

// Several public Sepolia RPCs: if one is blocked or slow, the next is tried.
const READ_RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.drpc.org",
  "https://rpc.sepolia.org"
];

// Put your real public website address here once hosted (no trailing slash),
// e.g. "https://anticounterfeit.netlify.app". Leave "" to use the current address.
const SITE_URL = "";

const ABI = [
  "function owner() view returns (address)",
  "function registerProduct(string _productId, string _productName, string _manufacturer, string _batchNumber, string _manufacturingDate)",
  "function verifyProduct(string _productId) view returns (bool, string, string, string, string)",
  "event ProductRegistered(string productId, string productName, string manufacturer)"
];

let provider, signer, contract;

function $(id) { return document.getElementById(id); }

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function setLoading(btn, loading, text) {
  if (!btn) return;
  if (loading) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>' + text;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || btn.textContent;
  }
}

/* ---------- Read from blockchain (no wallet needed) ---------- */
async function readProduct(id) {
  if (typeof ethers === "undefined") {
    throw new Error("ethers library failed to load. Disable your ad blocker or check your internet.");
  }
  let lastErr;
  for (const url of READ_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url, 11155111, { staticNetwork: true });
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, p);
      return await Promise.race([
        c.verifyProduct(id),
        new Promise((_, rej) => setTimeout(() => rej(new Error("RPC timeout")), 8000))
      ]);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/* ---------- Manufacturer: wallet ---------- */
async function connectWallet() {
  const walletStatus = $("walletStatus");
  if (typeof ethers === "undefined") {
    walletStatus.textContent = "ethers library failed to load. Disable your ad blocker or check your internet.";
    return false;
  }
  if (!window.ethereum) {
    walletStatus.textContent = "MetaMask not found. Please install it in this browser.";
    return false;
  }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== SEPOLIA_CHAIN_ID) {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }]
      });
    }
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    const addr = await signer.getAddress();
    walletStatus.textContent = "Connected: " + addr.slice(0, 6) + "..." + addr.slice(-4) + " (Sepolia)";
    return true;
  } catch (e) {
    walletStatus.textContent = "Connection failed: " + (e.shortMessage || e.message);
    return false;
  }
}

/* ---------- Manufacturer: QR code ---------- */
function showQr(productId) {
  const box = $("qrBox");
  if (!box) return;
  if (typeof QRCode === "undefined") {
    $("result").textContent += " (QR library did not load. Check your internet.)";
    return;
  }

  // Use the public site address so the QR works on any phone/computer
  const origin = SITE_URL || location.origin;
  const path = location.pathname.replace(/[^/]*$/, "") + "verify.html";
  const base = SITE_URL ? SITE_URL + "/verify.html" : origin + path;
  const link = base + "?id=" + encodeURIComponent(productId);

  const target = $("qrcode");
  target.innerHTML = "";
  new QRCode(target, { text: link, width: 200, height: 200 });
  $("qrLink").textContent = link;
  box.hidden = false;

  $("downloadQr").onclick = () => {
    const canvas = target.querySelector("canvas");
    const img = target.querySelector("img");
    const a = document.createElement("a");
    a.href = canvas ? canvas.toDataURL("image/png") : img.src;
    a.download = productId + "-qr.png";
    a.click();
  };

  $("copyLink").onclick = async () => {
    try {
      await navigator.clipboard.writeText(link);
      $("copyLink").textContent = "Copied!";
    } catch (e) {
      $("copyLink").textContent = "Copy failed";
    }
    setTimeout(() => { $("copyLink").textContent = "Copy Link"; }, 1500);
  };
}

/* ---------- Manufacturer: register ---------- */
async function registerProduct(e) {
  e.preventDefault();
  const result = $("result");
  const btn = $("registerBtn");
  if (!contract && !(await connectWallet())) return;

  const id = $("productId").value.trim();
  const name = $("productName").value.trim();
  const maker = $("manufacturer").value.trim();
  const batch = $("batchNumber").value.trim();
  const date = $("manufacturingDate").value;

  try {
    setLoading(btn, true, "Registering...");
    const owner = await contract.owner();
    const me = await signer.getAddress();
    if (owner.toLowerCase() !== me.toLowerCase()) {
      result.textContent = "Only the contract owner account can register products. Switch to Account 1 in MetaMask.";
      return;
    }
    result.textContent = "Confirm the transaction in MetaMask...";
    const tx = await contract.registerProduct(id, name, maker, batch, date);
    result.textContent = "Waiting for confirmation... Tx: " + tx.hash;
    await tx.wait();
    result.innerHTML = "✅ Product registered on blockchain! " +
      '<a target="_blank" rel="noopener" href="https://sepolia.etherscan.io/tx/' + tx.hash + '">View transaction</a>';
    showQr(id);
    $("productForm").reset();
  } catch (err) {
    result.textContent = "Failed: " + (err.reason || err.shortMessage || err.message);
  } finally {
    setLoading(btn, false);
  }
}

/* ---------- Customer: verify ---------- */
async function verifyProduct() {
  const id = $("verifyProductId").value.trim();
  const status = $("verifyStatus");
  const box = $("productResult");
  const heading = $("resultHeading");
  const details = $("resultDetails");
  const btn = $("verifyButton");
  box.hidden = true;
  box.className = "";
  if (!id) {
    status.textContent = "Please enter a Product ID.";
    return;
  }
  try {
    setLoading(btn, true, "Checking...");
    status.textContent = "Checking blockchain...";
    const r = await readProduct(id);
    status.textContent = "";
    box.hidden = false;
    if (r[0]) {
      box.className = "genuine";
      heading.textContent = "✅ Genuine Product";
      details.innerHTML =
        "<b>Name:</b> " + escapeHtml(r[1]) + "<br>" +
        "<b>Manufacturer:</b> " + escapeHtml(r[2]) + "<br>" +
        "<b>Batch:</b> " + escapeHtml(r[3]) + "<br>" +
        "<b>Manufactured:</b> " + escapeHtml(r[4]);
    } else {
      box.className = "fake";
      heading.textContent = "❌ Not Found";
      details.textContent = "This product is not registered. It may be counterfeit.";
    }
  } catch (err) {
    status.textContent = "Error: " + (err.shortMessage || err.message);
  } finally {
    setLoading(btn, false);
  }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  if ($("connectWallet")) $("connectWallet").addEventListener("click", connectWallet);
  if ($("productForm")) $("productForm").addEventListener("submit", registerProduct);
  if ($("verifyButton")) {
    $("verifyButton").addEventListener("click", verifyProduct);
    $("verifyProductId").addEventListener("keydown", (e) => {
      if (e.key === "Enter") verifyProduct();
    });
    const p = new URLSearchParams(location.search).get("id");
    if (p) {
      $("verifyProductId").value = p;
      verifyProduct();
    }
  }
});