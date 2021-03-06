/* @flow */
import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {ROOM_CHAT} from 'redux/modules/shared/room';
import {uiUpdate} from 'redux/modules/ui';
import {selectCurrentUser} from 'redux/modules/users';
import {socketEmitRoomEvent, socketEmitRoomJoin} from 'redux/modules/socket';
import {syncStart} from 'redux/modules/sync';
import ChatPanel from 'components/room/chat/ChatPanel';
import ColorContextProvider from 'components/context/color/ColorContextProvider';
import Track from 'components/track/Track';
import RoomMenu from 'components/room/menu/RoomMenu.js';
import TopBar from 'components/room/roomTopBar/RoomTopBar';
import ScrollStyle from '../../components/ui/scroll/ScrollStyle';
import Gradient from 'components/room/backgrounds/Gradient';
import FlipMove from 'react-flip-move';

import theme from './roomView.css';
import Play from 'components/svg/icons/Play';
import Listeners from 'components/room/listeners/Listeners';
import About from 'components/room/about/About';

class RoomView extends Component {
	static propTypes = {
		emitRoomEvent: PropTypes.func.isRequired,
		emitRoomJoin: PropTypes.func,
		currentUser: PropTypes.object,
		params: PropTypes.object,
		room: PropTypes.object,
		actionLogForChatPanel: PropTypes.array,
		roomChatText: PropTypes.string,
		clearChatText: PropTypes.func,
		syncStart: PropTypes.func,
		playlist: PropTypes.array,
		sync: PropTypes.object
	};

	// try to pull spotify track Ids from drop text
	onDrop = (evt) => {
		if (evt.preventDefault) evt.preventDefault();
		const text = evt.dataTransfer.getData('Text');
		// strip to just the track ids, and remove empties
		const trackIds = text
			.split('\n')
			.map(url => url.substr(url.lastIndexOf('/') + 1))
			.filter(item => item);

		this.props.emitRoomEvent({
			type: 'addOrVote',
			trackIds
		});
	};

	onDragOver = (evt) => {
		evt.preventDefault();
		evt.dataTransfer.dropEffect = 'copy';
	};

	componentWillMount() {
		const {room, params, emitRoomJoin} = this.props;
		// if we're not in this room but component just mounted, we'd better join it
		// todo: move this to a saga not UI
		if (room.id !== params.roomId) {
			emitRoomJoin();
		}

		// add the drag drop listeners to the document so you can drop anywhere, not just this
		// component.
		document.addEventListener('drop', this.onDrop);
		document.addEventListener('dragover', this.onDragOver);
	}

	componentWillUnmount() {
		document.removeEventListener('drop', this.onDrop);
		document.removeEventListener('dragover', this.onDragOver);
	}

	onChatSend() {
		const {roomChatText, clearChatText, emitRoomEvent} = this.props;
		if (roomChatText === '') {
			return;
		}
		emitRoomEvent({
			type: 'chat',
			text: roomChatText
		});
		clearChatText();
	}

	onClickVote = (trackId) => {
		this.props.emitRoomEvent({
			type: 'addOrVote',
			trackIds: [trackId]
		});
	};

	render() {
		const {
			room, params, actionLogForChatPanel, playlist, sync,
			syncStart, currentUser
		} = this.props;
		const roomTab = params.roomTab || 'next-up';

		if (room.id !== params.roomId) {
			// on mount we emitted a room join, so shouldn't be long now
			return <div className={theme.container}>
				{/* todo: room loading icon */}
			</div>;
		}

		let progressPercent = 0;
		if (playlist.length > 0) {
			progressPercent = room.nowPlayingProgress / playlist[0].duration * 100;
		}
		return (
			<ColorContextProvider colors={room.config.colors}>
				<ScrollStyle size={0.6} alpha={0.25}/>
				<Gradient />
				<TopBar room={room}/>
				<div className={theme.roomAndChat}>
					<div className={theme.room} ref='room'>
						<div className={theme.play} onClick={syncStart}>
							{(!sync.isSynced) && (
								<Play/>
							)}
						</div>
						<FlipMove duration={400}
								  easing='ease-in-out'
								  enterAnimation='elevator'>
							{playlist.map((track, index) => (
								<Track key={track.id}
									   track={track}
									   percentComplete={index === 0 ? progressPercent : -1}
									   onClickVote={this.onClickVote}
									   size={index === 0 ? 'hero' : 'normal'}
									   visible={index === 0 ? true : roomTab === 'next-up'}/>
							))}
						</FlipMove>
						<RoomMenu roomId={room.id} listeners={room.listeners} params={params}/>
						<div className={theme.otherTabs}>
							{roomTab === 'listeners' && <Listeners userIds={room.listeners}/>}
							{roomTab === 'about' && <About room={room} currentUser={currentUser}/>}
							{roomTab === 'top' &&
							<div>Top Tracks / Artists / Contributors coming soon!</div>}
						</div>
					</div>
					<div className={theme.chat}>
						<ChatPanel onChatSend={this.onChatSend.bind(this)}
								   actionLog={actionLogForChatPanel}/>
					</div>
				</div>
			</ColorContextProvider>
		);
	}
}

const mapStateToProps = state => ({
	currentUser: selectCurrentUser(state),
	room: state.room,
	sync: state.sync,
	actionLogForChatPanel: state.room.actionLog.filter(al => al.type === ROOM_CHAT)
		.map(chatWithUserId => ({
			...chatWithUserId,
			sentByCurrentUser: chatWithUserId.payload.userId === state.users.currentUserId,
			user: state.users.users[chatWithUserId.payload.userId]
		})),
	playlist: state.room.playlist.map((playTrack, index) => ({
		...playTrack,
		// map the track details and voting user's details from state
		...state.spotify.tracks[playTrack.id],
		votes: playTrack.votes.map(vote => ({
			...vote,
			user: state.users.users[vote.userId]
		})),
		canVote: index === 0
			? false
			: !playTrack.votes.find(vote => vote.userId === state.users.currentUserId)
	})),
	roomChatText: state.ui['roomChat']
});

const mapDispatchToProps = (dispatch, ownProps) => ({
	emitRoomEvent: (event) => {
		dispatch(socketEmitRoomEvent({roomId: ownProps.params.roomId, event}));
	},
	emitRoomJoin: () => {
		dispatch(socketEmitRoomJoin(ownProps.params.roomId));
	},
	clearChatText: () => {
		dispatch(uiUpdate({key: 'roomChat', newState: ''}));
	},
	syncStart: () => {
		dispatch(syncStart());
	}
});

export default connect(mapStateToProps, mapDispatchToProps)(RoomView);
