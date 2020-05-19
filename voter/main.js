// ESM syntax is supported.
export {}

import { newReleaseGold } from '@celo/contractkit/lib/generated/ReleaseGold'
import { newKit } from '@celo/contractkit'
import { ReleaseGoldWrapper } from '@celo/contractkit/lib/wrappers/ReleaseGold'
const BigNumber = require('bignumber.js');


// Voting needs to be done locally with the node that manages the unlocked account(s)
const celo = newKit('http://localhost:8545');

// The validator address (the one receiving rewards) that you will be voting from
const validatorVoterAddress = '';
// The validator group address that you will be voting for
const validatorGroupAddress = '';

const validatorRGAddress = '';

// Minimum tx amount
const txMinimum = 1000000000000000000;

// Minimum cGLD to reserve for paying fees
const reserveMinimum = 100000000000000000;






const getReleaseWrapper = async () => {
	let releaseGoldWrapper = new ReleaseGoldWrapper(
		celo,
		newReleaseGold(celo.web3, validatorRGAddress)
	)
	// Call arbitrary release gold fn to verify `contractAddress` is a releasegold contract.
	try {
		await releaseGoldWrapper.getBeneficiary()
	} catch (_) {
		this.error('Provided address does not point to release gold contract.')
	}
	return releaseGoldWrapper;
}


const delayUntilAfterEpoch = async () => {
  try {
    const epochBlocksRemaining = await getRemainingBlocksUntilNextEpoch();
    const timeUntilNextEpochWithBuffer = epochBlocksRemaining * 5000 + 300000;

    console.log(`Delaying voting for ${timeUntilNextEpochWithBuffer / 60000} minutes`);

    return setTimeout(() => voter(), timeUntilNextEpochWithBuffer);
  } catch (err) {
    console.error(`Error: ${err}\nRetrying`);
    return delayUntilAfterEpoch();
  }
};

const getTotalBalance = (address) => celo.getTotalBalance(address);

const exchangeDollars = async (amount) => {
  const exchange = await celo.contracts.getExchange();
  const minGoldAmount = await exchange.quoteUsdSell(amount);
  const stableToken = await celo.contracts.getStableToken();

  // // Prepare tx for requesting approval from stable token cotract
  const approveTx = await stableToken.approve(exchange.address, amount).send();

  // // Send approval tx and wait for receipt
  await approveTx.waitReceipt();

  const exchangeTx = await exchange.sellDollar(amount, minGoldAmount).send();

  return exchangeTx.waitReceipt();
};

const getRemainingBlocksUntilNextEpoch = async () => {
  const validators = await celo.contracts.getValidators();
  const epochSize = await validators.getEpochSize();
  const blockNumber = await celo.web3.eth.getBlockNumber();
  const remainingBlocks = epochSize - (blockNumber % epochSize);
  return remainingBlocks;
};



const lockGold = async (value) => {
  const lockedGold = await celo.contracts.getLockedGold();
  const tx = await lockedGold.lock()
	
   const res = await tx.send({  value: value.toFixed() });
  return res;
};

const vote = async (validatorGroup, amount) => {
  const election = await celo.contracts.getElection();
  const electionVote = await election.vote(validatorGroup, amount);
  const electionVoteTx = await electionVote.send();
  const electionVoteTxReceipt = await electionVoteTx.waitReceipt();

  return electionVoteTxReceipt;
};

const lockAndVote =  async (voterAddress, groupAddress) => {

    // Post-exchange balance
	const { gold } = await getTotalBalance(voterAddress);
	console.log(gold.isGreaterThanOrEqualTo(txMinimum))
    if (gold.isGreaterThanOrEqualTo(txMinimum)) {
      	const goldAmountToLock = gold.minus(reserveMinimum);

		console.log("about to lock")
      	const lockReceipt = await lockGold(goldAmountToLock);
		console.log(lockReceipt)
	}


	const lockedGold = await celo.contracts.getLockedGold();
	const nonvotingGold = new BigNumber (
		await lockedGold.getAccountNonvotingLockedGold(celo.defaultAccount),
	 );
	console.log(nonvotingGold)
	if ( nonvotingGold.isGreaterThan(0) ) {
    	const voteReceipt = await vote(groupAddress, nonvotingGold);
		console.log(voteReceipt)
	}
    
}

//NORMAL VALIDATOR FLOW
const voter = async () => {
  try {

    celo.defaultAccount = validatorAddress;

    const { usd } = await getTotalBalance(validatorAddress);
    console.log("balance: ", usd);

    if (usd.isGreaterThanOrEqualTo(txMinimum)) {
      await exchangeDollars(usd.toString(10));
    }

	await lockAndVote(validatorAddress)
    return delayUntilAfterEpoch();
  } catch (err) {
    console.error(`Error: ${err}\nRetrying in 5 minutes`);

    // Sleep for 5 minutes and retry on error
    return setTimeout(() => voter(), 300000);
  }
};

const transferFromRG = async () => {
	let res = await getReleaseWrapper()
	let { usd } = await res.kit.getTotalBalance(validatorRGAddress);
	
	if (usd.isGreaterThanOrEqualTo(txMinimum)) {
		const isRevoked = await res.isRevoked()
		celo.defaultAccount = isRevoked
			? await res.getReleaseOwner()
			: await res.getBeneficiary()
		let txResult = await res.transfer(validatorVoterAddress, usd.dividedBy(2).toNumber()).send()
		const txHash = await txResult.getHash()
		const txReceipt = await txResult.waitReceipt()
		return txReceipt
	}
}


//RG VALIDATOR FLOW
const main = async () => {
	try {

	console.log(await getRemainingBlocksUntilNextEpoch())
/*		
		let receipt = await transferFromRG()
		console.log(receipt)

		celo.defaultAccount = validatorVoterAddress
		let { usd } = await getTotalBalance(validatorVoterAddress);
		if (usd.isGreaterThanOrEqualTo(txMinimum)) {
			const exchangeReceipt = await exchangeDollars(usd.toString(10));
			console.log(exchangeReceipt)
		}

		await lockAndVote(validatorVoterAddress, validatorGroupAddress);
*/
	} catch (err) {
		console.error(`Error: ${err.stack}\n`);
	}
}




//voter();
main()
