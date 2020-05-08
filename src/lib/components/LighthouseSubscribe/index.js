/**
 * @fileoverview An element which shows a number of sparklines and gauges.
 */

import {html} from 'lit-element';
import {BaseStateElement} from '../BaseStateElement';
import {configureMessagingSubscription} from '../../actions';

/* eslint-disable require-jsdoc */
class LighthouseSubscribe extends BaseStateElement {
  static get properties() {
    return {
      isSignedIn: {type: Boolean},
      hasRegisteredMessaging: {type: Boolean},
      pendingMessagingUpdate: {type: Boolean},
    };
  }

  onStateChanged({isSignedIn, hasRegisteredMessaging, pendingMessagingUpdate}) {
    this.isSignedIn = isSignedIn;
    this.hasRegisteredMessaging = hasRegisteredMessaging;
    this.pendingMessagingUpdate = pendingMessagingUpdate;
  }

  _requestSubscribe() {
    configureMessagingSubscription(!this.hasRegisteredMessaging);
  }

  render() {
    if (!this.isSignedIn) {
      return html``;
    }

    return html`
      <button
        @click=${this._requestSubscribe}
        .disabled=${this.pendingMessagingUpdate}
      >
        ${this.hasRegisteredMessaging ? 'Cancel' : 'Subscribe'}
      </button>
    `;
  }
}

customElements.define('web-lighthouse-subscribe', LighthouseSubscribe);
