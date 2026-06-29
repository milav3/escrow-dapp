// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

contract ConditionalEscrow {

    enum State { CREATED, FUNDED, RELEASED, REFUNDED, DISPUTED, RESOLVED }

    struct Escrow {
        uint256 id;
        address payable buyer;
        address payable seller;
        address arbiter;
        uint256 amount;
        State state;
        uint256 createdAt;
        uint256 updatedAt;
    }

    Escrow[] public escrows;

    bool private locked;
    modifier noReentrance() {
        require(!locked, "Zastita: Reentrant poziv detektovan");
        locked = true;
        _;
        locked = false;
    }

    event EscrowCreated(uint256 indexed id, address indexed buyer, address indexed seller, address arbiter, uint256 timestamp);
    event EscrowFunded(uint256 indexed id, uint256 amount, uint256 timestamp);
    event FundsReleased(uint256 indexed id, address seller, uint256 amount, uint256 timestamp);
    event FundsRefunded(uint256 indexed id, address buyer, uint256 amount, uint256 timestamp);
    event DisputeRaised(uint256 indexed id, address raisedBy, uint256 timestamp);
    event DisputeResolved(uint256 indexed id, address arbiter, address winner, uint256 amount, uint256 timestamp);

    modifier escrowExists(uint256 _id) {
        require(_id < escrows.length, "Escrow ne postoji");
        _;
    }

    modifier onlyBuyer(uint256 _id) {
        require(msg.sender == escrows[_id].buyer, "Samo kupac moze izvrsiti akciju");
        _;
    }

    modifier onlySeller(uint256 _id) {
        require(msg.sender == escrows[_id].seller, "Samo prodavac moze izvrsiti akciju");
        _;
    }

    modifier onlyArbiter(uint256 _id) {
        require(msg.sender == escrows[_id].arbiter, "Samo autorizovani arbitar moze izvrsiti akciju");
        _;
    }

    modifier onlyParticipant(uint256 _id) {
        require(msg.sender == escrows[_id].buyer || msg.sender == escrows[_id].seller, "Samo ucesnici mogu pokrenuti spor");
        _;
    }

    
    function createEscrow(address payable _seller, address _arbiter) public returns (uint256) {
        require(_seller != address(0), "Adresa prodavca ne moze biti nula");
        require(_arbiter != address(0), "Adresa arbitra ne moze biti nula");
        require(_seller != msg.sender, "Kupac i prodavac ne mogu biti ista osoba");
        require(_arbiter != msg.sender && _arbiter != _seller, "Arbitar mora biti neutralna strana");

        uint256 id = escrows.length;

        escrows.push(Escrow({
            id: id,
            buyer: payable(msg.sender),
            seller: _seller,
            arbiter: _arbiter,
            amount: 0,              
            state: State.CREATED,   
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        }));

        emit EscrowCreated(id, msg.sender, _seller, _arbiter, block.timestamp);
        return id;
    }

    
    function fundEscrow(uint256 _id) public payable escrowExists(_id) onlyBuyer(_id) {
        Escrow storage escrow = escrows[_id];
        require(escrow.state == State.CREATED, "Escrow mora biti u stanju CREATED da bi se finansirao");
        require(msg.value > 0, "Morate deponovati iznos veci od 0");
        
        require(escrow.amount == 0, "Ovaj escrow je vec finansiran");

        escrow.amount = msg.value;
        escrow.state = State.FUNDED;
        escrow.updatedAt = block.timestamp;

        emit EscrowFunded(_id, msg.value, block.timestamp);
    }

    
    function confirmDelivery(uint256 _id) public escrowExists(_id) onlyBuyer(_id) noReentrance {
        Escrow storage escrow = escrows[_id];
        require(escrow.state == State.FUNDED, "Escrow nije u stanju FUNDED");
        
        uint256 amountToSend = escrow.amount;
        require(amountToSend > 0, "Sredstva su vec isplacena ili je iznos nula");

        escrow.state = State.RELEASED;
        escrow.amount = 0;
        escrow.updatedAt = block.timestamp;

        (bool success, ) = escrow.seller.call{value: amountToSend}("");
        require(success, "Isplata prodavcu nije uspela");

        emit FundsReleased(_id, escrow.seller, amountToSend, block.timestamp);
    }

    
    function raiseDispute(uint256 _id) public escrowExists(_id) onlyParticipant(_id) {
        Escrow storage escrow = escrows[_id];
        require(escrow.state == State.FUNDED, "Spor se moze pokrenuti samo iz FUNDED stanja");
        require(escrow.amount > 0, "Nema sredstava u ugovoru za spor");

        escrow.state = State.DISPUTED;
        escrow.updatedAt = block.timestamp;

        emit DisputeRaised(_id, msg.sender, block.timestamp);
    }

    function resolveDispute(uint256 _id, bool _resolveToSeller) public escrowExists(_id) onlyArbiter(_id) noReentrance {
        Escrow storage escrow = escrows[_id];
        require(escrow.state == State.DISPUTED, "Escrow mora biti u stanju spora (DISPUTED)");
        
        require(escrow.arbiter != address(0), "Arbitar ne moze biti nulta adresa");

        uint256 amountToSend = escrow.amount;
        require(amountToSend > 0, "Sredstva su vec isplacena iz ovog escrow-a");

        address payable winner = _resolveToSeller ? escrow.seller : escrow.buyer;
        require(winner != address(0), "Pobednik ne moze biti nulta adresa");

        escrow.state = State.RESOLVED;
        escrow.amount = 0;
        escrow.updatedAt = block.timestamp;

        (bool success, ) = winner.call{value: amountToSend}("");
        require(success, "Isplata pobedniku spora nije uspela");

        emit DisputeResolved(_id, msg.sender, winner, amountToSend, block.timestamp);
    }

    function refundBuyer(uint256 _id) public escrowExists(_id) onlySeller(_id) noReentrance {
        Escrow storage escrow = escrows[_id];
        require(escrow.state == State.FUNDED, "Refundacija moguca samo iz FUNDED stanja");

        uint256 amountToSend = escrow.amount;
        require(amountToSend > 0, "Sredstva su vec vracena ili podignuta");

        escrow.state = State.REFUNDED;
        escrow.amount = 0;
        escrow.updatedAt = block.timestamp;

        (bool success, ) = escrow.buyer.call{value: amountToSend}("");
        require(success, "Povracaj novca kupcu nije uspeo");

        emit FundsRefunded(_id, escrow.buyer, amountToSend, block.timestamp);
    }

    function getEscrowCount() public view returns (uint256) {
        return escrows.length;
    }
}