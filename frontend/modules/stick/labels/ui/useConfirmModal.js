// hooks/useConfirmModal.js
import React, { useState, useCallback } from 'react';
import ConfirmModal from './ConfirmModal';

export const useConfirmModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({});
  const [resolvePromise, setResolvePromise] = useState(null);

  const confirm = useCallback((config = {}) => {
    return new Promise((resolve) => {
      setModalConfig({
        title: 'Confirmation',
        message: 'Êtes-vous sûr ?',
        confirmText: 'Confirmer',
        cancelText: 'Annuler',
        variant: 'danger',
        ...config,
      });
      setResolvePromise(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolvePromise) {
      resolvePromise(true);
      setResolvePromise(null);
    }
    setIsOpen(false);
  }, [resolvePromise]);

  const handleCancel = useCallback(() => {
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
    setIsOpen(false);
  }, [resolvePromise]);

  // CORRECTION: Retourner un composant React valid
  const ConfirmModalComponent = useCallback(
    (props) => {
      return React.createElement(ConfirmModal, {
        isOpen: isOpen,
        onClose: handleCancel,
        onConfirm: handleConfirm,
        ...modalConfig,
        ...props,
      });
    },
    [isOpen, handleCancel, handleConfirm, modalConfig]
  );

  return {
    confirm,
    ConfirmModal: ConfirmModalComponent,
    isOpen,
    modalConfig,
  };
};
