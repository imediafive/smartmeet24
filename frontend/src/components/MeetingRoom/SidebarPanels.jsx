import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ChatPanel from './ChatPanel';
import NotesPanel from './NotesPanel';
import SummarySidebar from './SummarySidebar';
import ParticipantsPanel from './ParticipantsPanel';

const SidebarPanels = memo(({ panel, setPanel, showTranscript, setShowTranscript, showParticipants, setShowParticipants, messages, sendMsg, personalNotes, setPersonalNotes, isSavingNotes, transcript, summary, exportTranscript, myData, remoteUsers, isHost, user, peerStates }) => {
    return (
        <>
            <AnimatePresence>
                {panel === 'chat' && (
                    <motion.div initial={{ x: 340, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 340, opacity: 0 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[340px] z-[1000] border-l shadow-2xl flex flex-col backdrop-blur-3xl transition-all bg-white border-gray-200">
                        <ChatPanel messages={messages} onSend={sendMsg} onClose={() => setPanel(null)} />
                    </motion.div>
                )}
                {panel === 'notes' && (
                    <motion.div initial={{ x: 340, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 340, opacity: 0 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[340px] z-[1000] border-l shadow-2xl flex flex-col backdrop-blur-3xl transition-all bg-white border-gray-200">
                        <NotesPanel notes={personalNotes} setNotes={setPersonalNotes} isSaving={isSavingNotes} onClose={() => setPanel(null)} />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showTranscript && (
                    <motion.div initial={{ x: 400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 400, opacity: 0 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] z-[1001] shadow-2xl flex flex-col backdrop-blur-3xl transition-all">
                        <SummarySidebar transcript={transcript} summary={summary} onClose={() => setShowTranscript(false)} onExport={exportTranscript} />
                    </motion.div>
                )}
                {showParticipants && (
                    <motion.div initial={{ x: 340, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 340, opacity: 0 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[340px] z-[1000] border-l shadow-2xl flex flex-col backdrop-blur-3xl transition-all bg-white border-gray-200">
                        <ParticipantsPanel
                            participants={[myData, ...remoteUsers]}
                            onClose={() => setShowParticipants(false)}
                            isHost={isHost}
                            myId={user?.id}
                            peerStates={peerStates}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
});

export default SidebarPanels;
