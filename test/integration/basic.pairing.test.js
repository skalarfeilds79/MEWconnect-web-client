'use strict';

// Libs //
import Initiator from '../../src/MewConnectInitiator';
import MewConnectCrypto from '../../src/MewConnectCrypto';
import Receiver from '@clients/receiver';
import { signals, rtcSignals, roles } from '@signals';
import { stunServers, websocketURL } from '@config';

/*
|--------------------------------------------------------------------------
|
| MewConnect Pairing Integration Tests
|
|--------------------------------------------------------------------------
|
| The goal of these integration tests are to ensure the functionality of the MewConnect Pairing Server.
| The Pairing Server attempts to pair two "signaling" peers together via a secure socket connection,
| via AWS Lambda Websockets.
| These peers will then establish a webRTC connection to each other, allowing
| secure communication using the credentials created during the pairing process.
|
| The tests attempt to mirror the process defined in the following documentation outline:
| https://docs.google.com/document/d/19acrYB3iLT4j9JDg0xGcccLXFenqfSlNiKVpXOdLL6Y
|
| There are (4) primary processes that must be tested:
|
| 1. Initial Websocket Connection
| 2. WebRTC Offer Creation
| 3. WebRtc Answer Creation
| 4. WebRTC Connection
|
*/

const silent = true;
/*
===================================================================================
  Test "Member Variables"
===================================================================================
*/

// Clients //
let initiator;
let receiver;

// WebRTC Offer/Answer //
let webRTCOffer;
let webRTCAnswer;

// ICE Servers //
let iceServers;

/*
===================================================================================
  Test "Member Functions"
===================================================================================
*/

/**
 * Set a timeout to perform callback after process.env.CONNECTION_TIMEOUT.
 * This is done so that a test can pass after a given amount of time.
 *
 * @param  {Function} done - Callback function to perform (usually passing a test)
 */
const pass = async done => {
  setTimeout(done, process.env.CONNECTION_TIMEOUT);
};

/*
===================================================================================
  Test Start
===================================================================================
*/
describe('Pairing', () => {
  it('should produce the right signature', async done =>{
    const cryptoUtils = MewConnectCrypto.create();
    cryptoUtils.privateKey = '93c986b10c61619e8d0fca134f7708067371c18800a1bc096cbc879167b40e94';
    cryptoUtils.prvt = '93c986b10c61619e8d0fca134f7708067371c18800a1bc096cbc879167b40e94';
    const msg = cryptoUtils.signMessageSync('93c986b10c61619e8d0fca134f7708067371c18800a1bc096cbc879167b40e94')
    // const connId = this.mewCrypto.generateConnId(pk);
    const match = '1b6e26055360ede7b47430db8f36031ba905f038721a32dd0f6632f9d0221072fe6953bc4f0220b7263e0b7942a0d4cb5312e371eb66c03887c8261fa2c033520f';
    expect(msg).toEqual(match)
    done();
  })
  it('should produce the right signature2', async done =>{
    const cryptoUtils = MewConnectCrypto.create();
    cryptoUtils.privateKey = 'b9b13578ba4f9f01add2714a5fa277e389259fc809906441dfe2122727f2e779';
    cryptoUtils.prvt = 'b9b13578ba4f9f01add2714a5fa277e389259fc809906441dfe2122727f2e779';
    const msg = cryptoUtils.signMessageSync('b9b13578ba4f9f01add2714a5fa277e389259fc809906441dfe2122727f2e779')
    console.log(msg); // todo remove dev item
    // const connId = this.mewCrypto.generateConnId(pk);
    const match = '1c74b6f2cc4cb540cb7b17a0bf82b38a100109c6f150f23ddff23ad8f831f3dd9719abf1a249f7a9c7b9f03e36945880105e395dde555f5e67a8c6ba26acd6b3ed';
    expect(msg).toEqual(match)
    done();
  })
  it('should produce the right signature for QR code', async done =>{
    initiator = new Initiator();
    receiver = new Receiver();


    initiator.on('codeDisplay', (val) =>{
      console.log('code', val); // todo remove dev item
      const msg = initiator.signed;
      const privateKey = initiator.privateKey.toString('hex');
      expect(privateKey).toEqual('93c986b10c61619e8d0fca134f7708067371c18800a1bc096cbc879167b40e94')
      const match = '1b6e26055360ede7b47430db8f36031ba905f038721a32dd0f6632f9d0221072fe6953bc4f0220b7263e0b7942a0d4cb5312e371eb66c03887c8261fa2c033520f';
      expect(msg).toEqual(match)
      done();
    })

    const websocketURL = 'wss://0ec2scxqck.execute-api.us-west-1.amazonaws.com/dev';
    // initiator.generateKeys();
    await initiator.initiatorStart(websocketURL, '93c986b10c61619e8d0fca134f7708067371c18800a1bc096cbc879167b40e94');

  })
  it('Should connect', async done => {
    try {
      initiator = new Initiator();
      receiver = new Receiver();

      const websocketURL = 'wss://0ec2scxqck.execute-api.us-west-1.amazonaws.com/dev';
      // initiator.generateKeys();
      await initiator.initiatorStart(websocketURL);

      // Receiver //

      await receiver.setKeys(
        initiator.publicKey,
        initiator.privateKey,
        initiator.connId
      );
      await receiver.connect(websocketURL);

      receiver.on(signals.confirmation, stuff => {
        if(!silent) console.log('receiver', signals.confirmation, stuff); // todo remove dev item
      });

      receiver.on(signals.offerSignal, async data => {
        if(!silent) console.log('receiver', signals.offerSignal, data); // todo remove dev item
      });

      receiver.on(signals.offer, async data => {
        if(!silent) console.log('receiver', signals.offer, data); // todo remove dev item
        webRTCOffer = await receiver.decrypt(data.data);
        const answer = await receiver.answer(webRTCOffer);
        const message = { data: answer };
        receiver.onRTC(rtcSignals.connect, stuff => {
          receiver.sendRTC('address');
          if(!silent) console.log('receiver', rtcSignals.connect, stuff); // todo remove dev item
        });

        receiver.onRTC(rtcSignals.data, stuff => {
          if(!silent) console.log('receiver', rtcSignals.data, stuff); // todo remove dev item
          done();
        });
        receiver.send(signals.answerSignal, message);
      });

      initiator.on('RtcConnectedEvent', () => {
        if(!silent) console.log('Initiator rtc connected event'); // todo remove dev item
        initiator.rtcSend({ type: 'address', data: '' });
      });

    } catch (e) {
      // console.log(e); // todo remove dev item
      done.fail(e);
    }
  }, 25000);

  it('Should use Ice Servers', async done => {
    try {
      initiator = new Initiator();
      receiver = new Receiver();

      const websocketURL = 'wss://0ec2scxqck.execute-api.us-west-1.amazonaws.com/dev';
      // initiator.generateKeys();
      await initiator.initiatorStart(websocketURL);

      // Receiver //

      await receiver.setKeys(
        initiator.publicKey,
        initiator.privateKey,
        initiator.connId
      );
      await receiver.connect(websocketURL);

      let firstView = true;
      receiver.on(signals.confirmation, stuff => {
        if(!silent) console.log('receiver', signals.confirmation, stuff); // todo remove dev item
      });

      // receiver.on(signals.offerSignal, async data => {
      //   console.log('receiver', signals.offerSignal, data); // todo remove dev item
      // });

      receiver.on(signals.attemptingTurn, async data => {
        if(!silent) console.log('receiver attempting turn', data); // todo remove dev item
      });

      receiver.on('turntoken', async data => {
        if(!silent) console.log('receiver attempting turn'); // todo remove dev item
      });

      receiver.on(signals.offer, async data => {
        if(!silent) console.log('receiver', signals.offer, data); // todo remove dev item
        if (firstView) {
          initiator.disconnectRTC();
          console.log(signals.tryTurn); // todo remove dev item
          initiator.socketEmit(signals.tryTurn);
          firstView = false;
          return;
        }
        console.log('receiver', signals.offer, data); // todo remove dev item
        webRTCOffer = await receiver.decrypt(data.data);
        const answer = await receiver.answer(webRTCOffer);
        const message = { data: answer };
        receiver.onRTC(rtcSignals.connect, stuff => {
          receiver.sendRTC('address');
          if(!silent) console.log('receiver', rtcSignals.connect, stuff); // todo remove dev item
        });

        receiver.onRTC(rtcSignals.data, stuff => {
          if(!silent) console.log('receiver', rtcSignals.data, stuff); // todo remove dev item
          done();
        });
        receiver.send(signals.answerSignal, message);
      });

      initiator.on('RtcConnectedEvent', () => {
        if(!silent) console.log('Initiator rtc connected event'); // todo remove dev item
        initiator.rtcSend({ type: 'address', data: '' });
      });

    } catch (e) {
      // console.log(e); // todo remove dev item
      done.fail(e);
    }
  }, 35000);
  it('Should not send if no webRTC connection present', async done => {
    try {
      expect.assertions(1);
      initiator = new Initiator();
      receiver = new Receiver();

      const websocketURL = 'wss://0ec2scxqck.execute-api.us-west-1.amazonaws.com/dev';
      // initiator.generateKeys();
      await initiator.initiatorStart(websocketURL);

      // Receiver //

      await receiver.setKeys(
        initiator.publicKey,
        initiator.privateKey,
        initiator.connId
      );
      await receiver.connect(websocketURL);

      receiver.on(signals.confirmation, stuff => {
        if(!silent) console.log('receiver', signals.confirmation, stuff); // todo remove dev item
      });

      receiver.on(signals.offerSignal, async data => {
        if(!silent) console.log('receiver', signals.offerSignal, data); // todo remove dev item
      });

      receiver.on(signals.offer, async data => {
        if(!silent) console.log('receiver', signals.offer, data); // todo remove dev item
        webRTCOffer = await receiver.decrypt(data.data);
        const answer = await receiver.answer(webRTCOffer);
        const message = { data: answer };
        receiver.send(signals.answerSignal, message);
      });

      initiator.on('RtcConnectedEvent', async () => {
        if(!silent) console.log('Initiator rtc connected event'); // todo remove dev item
        initiator.disconnectRTC();
        const result = await initiator.rtcSend({ type: 'address', data: '' });
        if(!silent) console.log(result); // todo remove dev item
        expect(result).toBe(false)
        done();
      });

    } catch (e) {
      // console.log(e); // todo remove dev item
      done.fail(e);
    }
  }, 25000);
  xit('Should not or should do something', async done => {
    try {
      expect.assertions(1);
      initiator = new Initiator();
      receiver = new Receiver();

      const websocketURL = 'wss://0ec2scxqck.execute-api.us-west-1.amazonaws.com/dev';
      // initiator.generateKeys();
      await initiator.initiatorStart(websocketURL);

      // Receiver //

      await receiver.setKeys(
        initiator.publicKey,
        initiator.privateKey,
        initiator.connId
      );
      await receiver.connect(websocketURL);

      receiver.on(signals.confirmation, stuff => {
        // expect(stuff).
        if(!silent) console.log('receiver', signals.confirmation, stuff); // todo remove dev item
      });

      receiver.on(signals.offerSignal, async data => {
        if(!silent) console.log('receiver', signals.offerSignal, data); // todo remove dev item
      });

      receiver.on(signals.offer, async data => {
        if(!silent)  console.log('receiver', signals.offer, data); // todo remove dev item
        webRTCOffer = await receiver.decrypt(data.data);
        const answer = await receiver.answer(webRTCOffer);
        const message = { data: answer };
        receiver.send(signals.answerSignal, message);
      });

      initiator.on('RtcConnectedEvent', async () => {
        if(!silent)  console.log('Initiator rtc connected event'); // todo remove dev item
        await initiator.initiatorStart(websocketURL);
        const result = await initiator.rtcSend({ type: 'address', data: '' });
        console.log(result); // todo remove dev item
        expect(result).toBe(false)
        done();
      });

    } catch (e) {
      // console.log(e); // todo remove dev item
      done.fail(e);
    }
  }, 25000);
  xit('Should send a message via webRTC', async done => {

    receiver.onRTC(rtcSignals.data, stuff => {
      if(!silent)  console.log('receiver', rtcSignals.data, stuff); // todo remove dev item
      done();
    });

    initiator.rtcSend({ type: 'address', data: '' });
  });


});