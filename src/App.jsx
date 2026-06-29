import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, STATE_MAPPING } from "./contractConfig";
import "./App.css";

function App() {
  const [account, setAccount] = useState("");
  const [isSepolia, setIsSepolia] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sellerInput, setSellerInput] = useState("");
  const [arbiterInput, setArbiterInput] = useState("");
  const [selectedEscrowId, setSelectedEscrowId] = useState("");
  const [escrows, setEscrows] = useState([]);
  const [selectedEscrow, setSelectedEscrow] = useState(null);
  const [fundAmount, setFundAmount] = useState("");
  const [eventLog, setEventLog] = useState([]);

  const provider = useMemo(() => {
    if (!window.ethereum) return null;
    return new ethers.providers.Web3Provider(window.ethereum);
  }, []);

  const readContract = useMemo(() => {
    if (!provider) return null;
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  }, [provider]);

  const formatAddress = (value) => {
    if (!value) return "-";
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  };

  const formatTimestamp = (value) => {
    const numberValue = Number(value);
    if (!numberValue) return "-";
    return new Date(numberValue * 1000).toLocaleString("sr-RS");
  };

  const normalizeEscrow = (data) => ({
    id: data.id.toString(),
    buyer: data.buyer.toLowerCase(),
    seller: data.seller.toLowerCase(),
    arbiter: data.arbiter.toLowerCase(),
    amount: ethers.utils.formatEther(data.amount),
    state: Number(data.state),
    createdAt: Number(data.createdAt),
    updatedAt: Number(data.updatedAt),
  });

  const loadEventLog = async (escrowId) => {
    if (!readContract) return;

    const filters = [
      readContract.filters.EscrowCreated(escrowId),
      readContract.filters.EscrowFunded(escrowId),
      readContract.filters.FundsReleased(escrowId),
      readContract.filters.FundsRefunded(escrowId),
      readContract.filters.DisputeRaised(escrowId),
      readContract.filters.DisputeResolved(escrowId),
    ];

    const allEvents = [];
    for (const filter of filters) {
      const logs = await readContract.queryFilter(filter, 0, "latest");
      for (const log of logs) {
        allEvents.push({
          name: log.event,
          blockNumber: log.blockNumber,
          values: log.args,
        });
      }
    }

    allEvents.sort((left, right) => right.blockNumber - left.blockNumber);
    setEventLog(allEvents);
  };

  const loadEscrows = async (preferredId = "") => {
    if (!readContract) return;

    try {
      const count = Number(await readContract.getEscrowCount());
      const nextEscrows = [];

      for (let index = 0; index < count; index += 1) {
        const data = await readContract.escrows(index);
        nextEscrows.push(normalizeEscrow(data));
      }

      setEscrows(nextEscrows);

      if (nextEscrows.length === 0) {
        setSelectedEscrow(null);
        setEventLog([]);
        return;
      }

      const chosenId = String(preferredId || selectedEscrowId || nextEscrows[0].id);
      const chosenEscrow = nextEscrows.find((item) => item.id === chosenId) ?? nextEscrows[0];
      setSelectedEscrow(chosenEscrow);
      setSelectedEscrowId(chosenEscrow.id);
      await loadEventLog(chosenEscrow.id);
    } catch (err) {
      console.error(err);
      setError("Greška pri učitavanju escrow-a.");
    }
  };

  const loadEscrowById = async (id) => {
    if (!readContract || id === "") return;

    setError("");
    try {
      const data = await readContract.escrows(id);
      if (data.buyer === ethers.constants.AddressZero) {
        setSelectedEscrow(null);
        setEventLog([]);
        setError("Escrow sa tim ID-jem ne postoji.");
        return;
      }

      const escrow = normalizeEscrow(data);
      setSelectedEscrow(escrow);
      setSelectedEscrowId(escrow.id);
      await loadEventLog(escrow.id);
    } catch (err) {
      console.error(err);
      setError("Greška pri učitavanju escrow-a.");
    }
  };

  const getContractInstance = () => {
    const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = web3Provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  };

  const connectWallet = async () => {
    setError("");
    if (!window.ethereum) {
      setError("MetaMask nije detektovan.");
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0] || "");
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      const onSepolia = chainId === "0xaa36a7";
      setIsSepolia(onSepolia);
      if (!onSepolia) {
        setError("Prebaci MetaMask na Sepolia mrežu.");
      }
      await loadEscrows();
    } catch (err) {
      console.error(err);
      setError("Korisnik je odbio povezivanje novčanika.");
    }
  };

  const handleCreateEscrow = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const contract = getContractInstance();
      const tx = await contract.createEscrow(sellerInput, arbiterInput);
      const receipt = await tx.wait();
      const createdEvent = receipt.events?.find((item) => item.event === "EscrowCreated");
      const newId = createdEvent?.args?.id?.toString();

      setSellerInput("");
      setArbiterInput("");
      await loadEscrows(newId);
    } catch (err) {
      console.error(err);
      setError("Greška pri kreiranju: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleFundEscrow = async () => {
    if (!selectedEscrow || !fundAmount) return;

    setError("");
    setLoading(true);

    try {
      const contract = getContractInstance();
      const tx = await contract.fundEscrow(selectedEscrow.id, {
        value: ethers.utils.parseEther(fundAmount),
      });
      await tx.wait();
      setFundAmount("");
      await loadEscrows(selectedEscrow.id);
    } catch (err) {
      setError("Greška pri finansiranju: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!selectedEscrow) return;

    setError("");
    setLoading(true);

    try {
      const contract = getContractInstance();
      const tx = await contract.confirmDelivery(selectedEscrow.id);
      await tx.wait();
      await loadEscrows(selectedEscrow.id);
    } catch (err) {
      setError("Greška pri potvrdi: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRaiseDispute = async () => {
    if (!selectedEscrow) return;

    setError("");
    setLoading(true);

    try {
      const contract = getContractInstance();
      const tx = await contract.raiseDispute(selectedEscrow.id);
      await tx.wait();
      await loadEscrows(selectedEscrow.id);
    } catch (err) {
      setError("Greška pri pokretanju spora: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRefundBuyer = async () => {
    if (!selectedEscrow) return;

    setError("");
    setLoading(true);

    try {
      const contract = getContractInstance();
      const tx = await contract.refundBuyer(selectedEscrow.id);
      await tx.wait();
      await loadEscrows(selectedEscrow.id);
    } catch (err) {
      setError("Greška pri vraćanju novca: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleResolveDispute = async (resolveToSeller) => {
    if (!selectedEscrow) return;

    setError("");
    setLoading(true);

    try {
      const contract = getContractInstance();
      const tx = await contract.resolveDispute(selectedEscrow.id, resolveToSeller);
      await tx.wait();
      await loadEscrows(selectedEscrow.id);
    } catch (err) {
      setError("Greška pri rešavanju spora: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!window.ethereum) return undefined;

    const handleAccountsChanged = (accounts) => {
      setAccount(accounts[0] || "");
    };

    const handleChainChanged = async () => {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      setIsSepolia(chainId === "0xaa36a7");
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  useEffect(() => {
    if (account && readContract) {
      loadEscrows(selectedEscrowId);
    }
    
  }, [account, readContract]);

  return (
    <main className="app-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">Conditional Escrow DApp</p>
          <h1>Escrow aplikacija</h1>
          <p className="lead">Kreiranje, finansiranje, potvrda prijema i arbitraža preko MetaMask-a.</p>
        </div>

        <div className="hero-meta">
          <span className={isSepolia ? "badge badge-ok" : "badge badge-warn"}>
            {isSepolia ? "Sepolia" : "Van Sepolije"}
          </span>
          <span className="badge badge-neutral">Ugovor: {formatAddress(CONTRACT_ADDRESS)}</span>
          {account ? <span className="mono-chip">{formatAddress(account)}</span> : null}
        </div>
      </header>

      <section className="panel panel-row">
        {!account ? (
          <>
            <div>
              <h2>Povezivanje</h2>
              <p>Prvo poveži MetaMask, zatim učitaj ili kreiraj escrow.</p>
            </div>
            <button className="primary" onClick={connectWallet}>Poveži novčanik</button>
          </>
        ) : (
          <>
            <div>
              <h2>Povezan nalog</h2>
              <p className="mono-chip">{account}</p>
            </div>
            <button className="secondary" onClick={() => loadEscrows(selectedEscrowId)}>Osveži podatke</button>
          </>
        )}
      </section>

      {error ? <section className="alert">{error}</section> : null}
      {loading ? <section className="alert alert-info">Transakcija je u toku...</section> : null}

      {account ? (
        <div className="grid">
          <section className="panel">
            <h2>Kreiraj escrow</h2>
            <form className="stack" onSubmit={handleCreateEscrow}>
              <label>
                Prodavac
                <input value={sellerInput} onChange={(e) => setSellerInput(e.target.value)} placeholder="0x..." required />
              </label>
              <label>
                Arbitar
                <input value={arbiterInput} onChange={(e) => setArbiterInput(e.target.value)} placeholder="0x..." required />
              </label>
              <button className="primary" type="submit" disabled={loading}>Kreiraj novi escrow</button>
            </form>
          </section>

          <section className="panel">
            <h2>Pregled escrow-a</h2>
            <div className="stack">
              <label>
                Izaberi ID
                <input
                  value={selectedEscrowId}
                  onChange={(e) => setSelectedEscrowId(e.target.value)}
                  placeholder="0"
                />
              </label>
              <button className="secondary" onClick={() => loadEscrowById(selectedEscrowId)}>Učitaj ID</button>
            </div>

            <div className="list">
              {escrows.length === 0 ? (
                <p>Nema escrow-a u ugovoru.</p>
              ) : (
                escrows.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={selectedEscrow?.id === item.id ? "list-item active" : "list-item"}
                    onClick={() => loadEscrowById(item.id)}
                  >
                    <strong>#{item.id}</strong>
                    <span>{STATE_MAPPING[item.state]}</span>
                    <span>{item.amount} ETH</span>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      {selectedEscrow ? (
        <div className="grid detail-grid">
          <section className="panel">
            <h2>Detalji escrow-a #{selectedEscrow.id}</h2>
            <div className="details">
              <p><span>Stanje</span><strong>{STATE_MAPPING[selectedEscrow.state]}</strong></p>
              <p><span>Kupac</span><strong>{selectedEscrow.buyer}</strong></p>
              <p><span>Prodavac</span><strong>{selectedEscrow.seller}</strong></p>
              <p><span>Arbitar</span><strong>{selectedEscrow.arbiter}</strong></p>
              <p><span>Iznos</span><strong>{selectedEscrow.amount} ETH</strong></p>
              <p><span>Kreiran</span><strong>{formatTimestamp(selectedEscrow.createdAt)}</strong></p>
              <p><span>Izmenjen</span><strong>{formatTimestamp(selectedEscrow.updatedAt)}</strong></p>
            </div>

            <div className="action-block">
              {selectedEscrow.state === 0 && account === selectedEscrow.buyer ? (
                <>
                  <label>
                    Iznos za uplatu (ETH)
                    <input
                      type="number"
                      step="0.0001"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      placeholder="0.01"
                    />
                  </label>
                  <button className="primary" onClick={handleFundEscrow} disabled={loading || !fundAmount}>
                    Finansiraj escrow
                  </button>
                </>
              ) : null}

              {selectedEscrow.state === 1 && account === selectedEscrow.buyer ? (
                <div className="action-row">
                  <button className="primary" onClick={handleConfirmDelivery} disabled={loading}>Potvrdi prijem</button>
                  <button className="danger" onClick={handleRaiseDispute} disabled={loading}>Pokreni spor</button>
                </div>
              ) : null}

              {selectedEscrow.state === 1 && account === selectedEscrow.seller ? (
                <button className="secondary" onClick={handleRefundBuyer} disabled={loading}>Vrati novac kupcu</button>
              ) : null}

              {selectedEscrow.state === 4 && account === selectedEscrow.arbiter ? (
                <div className="action-row">
                  <button className="secondary" onClick={() => handleResolveDispute(false)} disabled={loading}>Vrati kupcu</button>
                  <button className="primary" onClick={() => handleResolveDispute(true)} disabled={loading}>Isplati prodavcu</button>
                </div>
              ) : null}

              {!((selectedEscrow.state === 0 && account === selectedEscrow.buyer) ||
                (selectedEscrow.state === 1 && (account === selectedEscrow.buyer || account === selectedEscrow.seller)) ||
                (selectedEscrow.state === 4 && account === selectedEscrow.arbiter)) ? (
                <p className="muted">Na ovom stanju tvoj nalog nema dostupnu akciju.</p>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <h2>Događaji</h2>
            {eventLog.length === 0 ? (
              <p>Nema događaja za ovaj escrow.</p>
            ) : (
              <div className="event-list">
                {eventLog.map((event, index) => (
                  <article key={`${event.name}-${index}`} className="event-item">
                    <strong>{event.name}</strong>
                    <span>Blok: {event.blockNumber}</span>
                    <span>Vrednosti: {event.values ? Array.from(event.values).join(" | ") : "-"}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;