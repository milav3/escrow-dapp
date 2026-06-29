const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ConditionalEscrow", function () {
  let ConditionalEscrow;
  let escrowContract;
  let owner;
  let buyer;
  let seller;
  let arbiter;
  let externalUser;

  const depositAmount = ethers.utils.parseEther("1.0"); // 1 ETH

  beforeEach(async function () {
    [owner, buyer, seller, arbiter, externalUser] = await ethers.getSigners();

    ConditionalEscrow = await ethers.getContractFactory("ConditionalEscrow");
    escrowContract = await ConditionalEscrow.deploy();
    await escrowContract.deployed();
  });

  describe("Kreiranje Escrow-a", function () {
    it("Treba uspešno kreirati escrow sa ispravnim parametrima", async function () {
      await expect(escrowContract.connect(buyer).createEscrow(seller.address, arbiter.address))
        .to.emit(escrowContract, "EscrowCreated")
        .withArgs(0, buyer.address, seller.address, arbiter.address, anyValue => true);

      const escrow = await escrowContract.escrows(0);
      expect(escrow.buyer).to.equal(buyer.address);
      expect(escrow.seller).to.equal(seller.address);
      expect(escrow.arbiter).to.equal(arbiter.address);
      expect(escrow.amount).to.equal(0);
      expect(escrow.state).to.equal(0); // State.CREATED
    });

    it("Treba da padne ako je prodavac nulta adresa", async function () {
      await expect(
        escrowContract.connect(buyer).createEscrow(ethers.constants.AddressZero, arbiter.address)
      ).to.be.revertedWith("Adresa prodavca ne moze biti nula");
    });

    it("Treba da padne ako su kupac i prodavac ista osoba", async function () {
      await expect(
        escrowContract.connect(buyer).createEscrow(buyer.address, arbiter.address)
      ).to.be.revertedWith("Kupac i prodavac ne mogu biti ista osoba");
    });
  });

  describe("Finansiranje (Fund) Escrow-a", function () {
    beforeEach(async function () {
      await escrowContract.connect(buyer).createEscrow(seller.address, arbiter.address);
    });

    it("Kupac treba uspešno da finansira escrow", async function () {
      await expect(escrowContract.connect(buyer).fundEscrow(0, { value: depositAmount }))
        .to.emit(escrowContract, "EscrowFunded")
        .withArgs(0, depositAmount, anyValue => true);

      const escrow = await escrowContract.escrows(0);
      expect(escrow.amount).to.equal(depositAmount);
      expect(escrow.state).to.equal(1); // State.FUNDED
    });

    it("Treba da padne ako neko drugi pokušava da finansira umesto kupca", async function () {
      await expect(
        escrowContract.connect(externalUser).fundEscrow(0, { value: depositAmount })
      ).to.be.revertedWith("Samo kupac moze izvrsiti akciju");
    });

    it("Treba da padne ako se šalje 0 ethera", async function () {
      await expect(
        escrowContract.connect(buyer).fundEscrow(0, { value: 0 })
      ).to.be.revertedWith("Morate deponovati iznos veci od 0");
    });
  });

  describe("Potvrda isporuke (Confirm Delivery)", function () {
    beforeEach(async function () {
      await escrowContract.connect(buyer).createEscrow(seller.address, arbiter.address);
      await escrowContract.connect(buyer).fundEscrow(0, { value: depositAmount });
    });

    it("Kupac potvrđuje isporuku i prodavac dobija sredstva", async function () {
      const initialSellerBalance = await seller.getBalance();

      await expect(escrowContract.connect(buyer).confirmDelivery(0))
        .to.emit(escrowContract, "FundsReleased")
        .withArgs(0, seller.address, depositAmount, anyValue => true);

      const finalSellerBalance = await seller.getBalance();
      expect(finalSellerBalance.sub(initialSellerBalance)).to.equal(depositAmount);

      const escrow = await escrowContract.escrows(0);
      expect(escrow.state).to.equal(2); // State.RELEASED
      expect(escrow.amount).to.equal(0);
    });
  });

  describe("Sporovi i Arbitraža (Dispute & Resolve)", function () {
    beforeEach(async function () {
      await escrowContract.connect(buyer).createEscrow(seller.address, arbiter.address);
      await escrowContract.connect(buyer).fundEscrow(0, { value: depositAmount });
    });

    it("Kupac može uspešno pokrenuti spor", async function () {
      await expect(escrowContract.connect(buyer).raiseDispute(0))
        .to.emit(escrowContract, "DisputeRaised")
        .withArgs(0, buyer.address, anyValue => true);

      const escrow = await escrowContract.escrows(0);
      expect(escrow.state).to.equal(4); // State.DISPUTED
    });

    it("Arbitar rešava spor u korist prodavca", async function () {
      await escrowContract.connect(buyer).raiseDispute(0);

      const initialSellerBalance = await seller.getBalance();

      await expect(escrowContract.connect(arbiter).resolveDispute(0, true))
        .to.emit(escrowContract, "DisputeResolved")
        .withArgs(0, arbiter.address, seller.address, depositAmount, anyValue => true);

      const finalSellerBalance = await seller.getBalance();
      expect(finalSellerBalance.sub(initialSellerBalance)).to.equal(depositAmount);
    });

    it("Arbitar rešava spor u korist kupca", async function () {
      await escrowContract.connect(buyer).raiseDispute(0);

      const initialBuyerBalance = await buyer.getBalance();

      await expect(escrowContract.connect(arbiter).resolveDispute(0, false))
        .to.emit(escrowContract, "DisputeResolved")
        .withArgs(0, arbiter.address, buyer.address, depositAmount, anyValue => true);

      const escrow = await escrowContract.escrows(0);
      expect(escrow.state).to.equal(5); // State.RESOLVED
      expect(escrow.amount).to.equal(0);
    });

    it("Treba da padne ako ne-autorizovana osoba pokušava da reši spor", async function () {
      await escrowContract.connect(buyer).raiseDispute(0);
      
      await expect(
        escrowContract.connect(externalUser).resolveDispute(0, true)
      ).to.be.revertedWith("Samo autorizovani arbitar moze izvrsiti akciju");
    });
  });

  describe("Refundacija (Refund)", function () {
    beforeEach(async function () {
      await escrowContract.connect(buyer).createEscrow(seller.address, arbiter.address);
      await escrowContract.connect(buyer).fundEscrow(0, { value: depositAmount });
    });

    it("Prodavac može samostalno vratiti novac kupcu", async function () {
      await expect(escrowContract.connect(seller).refundBuyer(0))
        .to.emit(escrowContract, "FundsRefunded")
        .withArgs(0, buyer.address, depositAmount, anyValue => true);

      const escrow = await escrowContract.escrows(0);
      expect(escrow.state).to.equal(3); // State.REFUNDED
      expect(escrow.amount).to.equal(0);
    });

    it("Treba da padne ako kupac pokušava sam sebi da odobri refund", async function () {
      await expect(
        escrowContract.connect(buyer).refundBuyer(0)
      ).to.be.revertedWith("Samo prodavac moze izvrsiti akciju");
    });
  });
});