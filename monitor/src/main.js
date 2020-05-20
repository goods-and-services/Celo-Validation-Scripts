// ESM syntax is supported.
export {}
import Web3 from 'web3';
import { eqAddress } from '@celo/utils/lib/address';
import { newKit } from '@celo/contractkit';
import { bitIsSet, parseBlockExtraData } from '@celo/utils/lib/istanbul';
import CloudWatch from 'aws-sdk/clients/cloudwatch';

const SIGNER = "<SIGNER-ADDRESS>"
const cloudwatch = new CloudWatch({region: 'us-west-1'});
const kit = newKit('http://localhost:8545');


/*
I run this script in 30 second intervals.
It pushes the last 6 blocks to a graph metric,
then pushes up the % signatures missed of the last 
100 blocks to another numeric metric

*/

const logToCloudWatch = async (valArr)=>{
		
	let lastSix = valArr.slice(-6);
	for (const val of lastSix) {
		let params = {
			Namespace: "Signatures",
			MetricData: [
				{
					MetricName: "Signature Present",
					Value: val.Status,
					Timestamp: val.Timestamp,
					Unit: "Count"
				}
			]
		}
		cloudwatch.putMetricData(params, function(err, data) {
			if (err) console.log(err, err.stack); // an error occurred
			else console.log(data);           // successful response
		});
	}
	
	const percent = (valArr.reduce( (a, b) => a + b.Status, 0) * 1.0 ) / valArr.length;
	let params = {
		Namespace: "Signatures",
		MetricData: [
			{
				MetricName: "% Blocks Signed",
				Value: (percent === 100 ? 100 : Number(percent * 100)) ,
				Unit: "Percent"
			}
		]
	}
	cloudwatch.putMetricData(params, function(err, data) {
		if (err) console.log(err, err.stack); // an error occurred
		else console.log(data);           // successful response
	});

}

const  firstBlockOfEpoch = async (blockNumber, epochSize) =>{
	const epochNumber = Math.ceil(blockNumber / this.epochSize)
	return (epochNumber - 1) * epochSize + 1
}

const signerIsPresent = async (block, election, epochSize, signer) => {
	const electedSigners = await election.getCurrentValidatorSigners( firstBlockOfEpoch(block.number, epochSize) )
    const signerIndex = electedSigners.map(eqAddress.bind(null, signer)).indexOf(true)
    if (signerIndex < 0) {
      return false
    }
    const bitmap = parseBlockExtraData(block.extraData).parentAggregatedSeal.bitmap
    return bitIsSet(bitmap, signerIndex)
}

const  logAlertSignerStatus = async (blocks, signer) => {
    const validators = await kit.contracts.getValidators()
	const election = await kit.contracts.getElection()
	let epochSize = await validators.getEpochSize()
	let valArr = []
	for (const block of blocks){
		valArr.push( { Status: ((await signerIsPresent(block, election, epochSize, signer)) === true ? 1 : 0), Timestamp: block.timestamp }  )
	}
	await logToCloudWatch(valArr)
}

const  getLatestBlocks = async (lookback) => {
	let nodeUrl = "http://localhost:8545"
	let web3 = await new Web3(nodeUrl)
	let latest = (await web3.eth.getBlock('latest')).number
	let blocks = [] 
	for ( let i=0; i < lookback; i++){
		blocks.push( (await web3.eth.getBlock(latest - lookback + i + 1)) )
	}
	return blocks	
}

const  main = async (signer, lookback) => {
	let blocks = await getLatestBlocks(lookback)
	await logAlertSignerStatus(blocks, signer)
}


main(SIGNER, 100)



