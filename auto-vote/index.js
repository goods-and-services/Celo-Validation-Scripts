import {BigNumber} from 'bignumber'

//import { ReleaseGoldWrapper } from '@celo/contractkit/lib/wrappers/ReleaseGold.js'
import { newKit } from '@celo/contractkit'



// Voting needs to be done locally with the node that manages the unlocked account(s)
const celo = newKit('http://localhost:8545');

console.log(celo.lib)
// The validator address (the one receiving rewards) that you will be voting from
const validatorAddress = '0xef5571aFbDAB1699f905a007AF58F8b0930649DA';

// The validator group address that you will be voting for
const validatorGroupAddress = '0x4caEEFF39cd3b889462b995bDAf2dF97836f490C';

const validatorRGAddress = ''

// Minimum tx amount
const txMinimum = 150000000000000000000;

// Minimum cGLD to reserve for paying fees
const reserveMinimum = 10000000000000000000;



const voter = async () => {
  try {
    celo.defaultAccount = validatorAddress;

    const { usd } = await getTotalBalance(validatorAddress);
    console.log("balance: ", usd);

    if (usd.isGreaterThanOrEqualTo(txMinimum)) {
      await exchangeDollars(usd.toString(10));
    }

    // Post-exchange balance
    const { gold } = await getTotalBalance(validatorAddress);

    if (gold.isGreaterThanOrEqualTo(txMinimum)) {
      const goldAmountToLock = new BigNumber(gold.minus(reserveMinimum));

	console.log("about to lock")
      await lockGold(goldAmountToLock.toString(10));
      await vote(validatorGroupAddress);
    }

    return delayUntilAfterEpoch();
  } catch (err) {
    console.error(`Error: ${err}\nRetrying in 5 minutes`);

    // Sleep for 5 minutes and retry on error
    return setTimeout(() => voter(), 300000);
  }
};


const getReleaseWrapper = async () => {


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

const getTotalBalance = () => celo.getTotalBalance(validatorAddress);

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

const lockGold = async (value) => {
  const lockedGold = await celo.contracts.getLockedGold();
  const lockedGoldResults = await lockedGold
    .lock()
    .sendAndWaitForReceipt({ from: celo.defaultAccount, value });
  return lockedGoldResults;
};

const vote = async (validatorGroup) => {
  const lockedGold = await celo.contracts.getLockedGold();
  const nonvotingGold = new BigNumber(
    await lockedGold.getAccountNonvotingLockedGold(celo.defaultAccount),
  );
  const election = await celo.contracts.getElection();
  const electionVote = await election.vote(validatorGroup, nonvotingGold);
  const electionVoteTx = await electionVote.send();
  const electionVoteTxReceipt = await electionVoteTx.waitReceipt();

  return electionVoteTxReceipt;
};

const getRemainingBlocksUntilNextEpoch = async () => {
  const validators = await celo.contracts.getValidators();
  const epochSize = await validators.getEpochSize();
  const blockNumber = await celo.web3.eth.getBlockNumber();
  const remainingBlocks = epochSize - (blockNumber % epochSize);
  return remainingBlocks;
};

voter();
